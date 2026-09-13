import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { pool } from "../db";
import { ah } from "../lib/asyncHandler";
import { ApiError } from "../middleware/error";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { hashToken, generateOpaqueToken } from "../lib/tokens";
import { sendMail } from "../lib/mailer";
import { revokeAllSessions } from "../lib/authHelpers";
import { deleteAllWithPrefix } from "../lib/r2";
import { recordAuditEvent } from "../lib/audit";
import { sendVerificationEmail } from "./auth";
import { env } from "../env";

export const accountRouter = Router();

// --- email verification ---

accountRouter.post("/resend-verification", requireAuth, ah(async (req: AuthedRequest, res) => {
  const { rows } = await pool.query<{ email: string; email_verified_at: Date | null }>(
    "SELECT email, email_verified_at FROM users WHERE id = $1", [req.userId]
  );
  if (rows[0]?.email_verified_at) return res.json({ alreadyVerified: true });
  if (rows[0]) await sendVerificationEmail(req.userId!, rows[0].email);
  res.json({ alreadyVerified: false });
}));

const verifySchema = z.object({ token: z.string().min(1) });

accountRouter.post("/verify-email", ah(async (req, res) => {
  const { token } = verifySchema.parse(req.body);
  const { rows } = await pool.query<{ id: string; user_id: string; expires_at: Date; used_at: Date | null }>(
    "SELECT * FROM email_verification_tokens WHERE token_hash = $1", [hashToken(token)]
  );
  const record = rows[0];
  if (!record || record.used_at || record.expires_at.getTime() < Date.now()) {
    throw new ApiError(400, "invalid_or_expired_token");
  }
  await pool.query("UPDATE users SET email_verified_at = now() WHERE id = $1", [record.user_id]);
  await pool.query("UPDATE email_verification_tokens SET used_at = now() WHERE id = $1", [record.id]);
  recordAuditEvent(record.user_id, "email_verified", req, {});
  res.json({ verified: true });
}));

// --- password reset (forgot password, unauthenticated) ---

const resetLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

const requestResetSchema = z.object({ email: z.string().trim().toLowerCase().email() });

accountRouter.post("/request-password-reset", resetLimiter, ah(async (req, res) => {
  const { email } = requestResetSchema.parse(req.body);
  const { rows } = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);

  // Always respond 200 regardless of whether the account exists — a
  // different response would let anyone enumerate registered emails by
  // watching for which ones "fail".
  if (rows[0]) {
    const { plaintext, hash } = generateOpaqueToken();
    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)",
      [rows[0].id, hash, new Date(Date.now() + 3600_000)]
    );
    const link = `${env.APP_URL}reset-password?token=${plaintext}`;
    await sendMail(email, "Reset your Dosed password", `Tap to set a new password:\n\n${link}\n\nExpires in 1 hour. If you didn't request this, ignore this email.`);
    recordAuditEvent(rows[0].id, "password_reset_requested", req, {});
  }
  res.json({ sent: true });
}));

const resetSchema = z.object({ token: z.string().min(1), newPassword: z.string().min(8) });

accountRouter.post("/reset-password", resetLimiter, ah(async (req, res) => {
  const { token, newPassword } = resetSchema.parse(req.body);
  const { rows } = await pool.query<{ id: string; user_id: string; expires_at: Date; used_at: Date | null }>(
    "SELECT * FROM password_reset_tokens WHERE token_hash = $1", [hashToken(token)]
  );
  const record = rows[0];
  if (!record || record.used_at || record.expires_at.getTime() < Date.now()) {
    throw new ApiError(400, "invalid_or_expired_token");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.query("UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL WHERE id = $2", [passwordHash, record.user_id]);
  await pool.query("UPDATE password_reset_tokens SET used_at = now() WHERE id = $1", [record.id]);
  // A password reset is exactly the moment to assume every existing
  // session might be compromised (that's often *why* someone resets) —
  // sign every device out and require the new password everywhere.
  await revokeAllSessions(record.user_id);
  recordAuditEvent(record.user_id, "password_reset_completed", req, {});
  res.json({ reset: true });
}));

// --- change password (authenticated, knows current password) ---

const changeSchema = z.object({ currentPassword: z.string(), newPassword: z.string().min(8) });

accountRouter.post("/change-password", requireAuth, ah(async (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = changeSchema.parse(req.body);
  const { rows } = await pool.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [req.userId]);
  const ok = rows[0] && (await bcrypt.compare(currentPassword, rows[0].password_hash));
  if (!ok) throw new ApiError(401, "invalid_current_password");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, req.userId]);
  await revokeAllSessions(req.userId!);
  recordAuditEvent(req.userId!, "password_changed", req, {});
  res.json({ changed: true });
}));

accountRouter.get("/audit-log", requireAuth, ah(async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT event_type as "eventType", ip_address as "ipAddress", metadata, created_at as "createdAt"
     FROM security_audit_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.userId]
  );
  res.json({ events: rows });
}));

accountRouter.get("/me", requireAuth, ah(async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT id, email, username, phone, email_verified_at as "emailVerifiedAt", phone_verified_at as "phoneVerifiedAt"
     FROM users WHERE id = $1`, [req.userId]
  );
  if (!rows[0]) throw new ApiError(404, "not_found");
  res.json(rows[0]);
}));

// --- data export (GDPR Art. 20 / CCPA right to know) ---

// Everything the account owns, in one JSON file the person can actually
// keep or hand to another service — this is what "Data portability" in
// the Privacy Policy refers to. Deliberately excludes password_hash and
// security_audit_log: the former is a secret, not "your data" in the
// portability sense, and the latter is about *us* protecting *you*, not
// something you'd port elsewhere.
accountRouter.get("/export", requireAuth, ah(async (req: AuthedRequest, res) => {
  const [user, pets, medications, doseLogs] = await Promise.all([
    pool.query(
      `SELECT id, email, username, phone, created_at as "createdAt",
              email_verified_at as "emailVerifiedAt", phone_verified_at as "phoneVerifiedAt"
       FROM users WHERE id = $1`, [req.userId]
    ),
    pool.query(
      `SELECT id, name, species, breed, weight_kg as "weightKg", photo_uri as "photoUri", notes,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM pets WHERE user_id = $1 AND deleted_at IS NULL`, [req.userId]
    ),
    pool.query(
      `SELECT id, pet_id as "petId", name, dosage_value as "dosageValue", dosage_unit as "dosageUnit",
              schedule_type as "scheduleType", times, interval_hours as "intervalHours",
              start_date as "startDate", end_date as "endDate", active, notes, updated_at as "updatedAt"
       FROM medications WHERE user_id = $1 AND deleted_at IS NULL`, [req.userId]
    ),
    pool.query(
      `SELECT id, medication_id as "medicationId", scheduled_at as "scheduledAt", taken_at as "takenAt",
              status, amount_taken as "amountTaken", note, updated_at as "updatedAt"
       FROM dose_logs WHERE user_id = $1 AND deleted_at IS NULL`, [req.userId]
    ),
  ]);

  if (!user.rows[0]) throw new ApiError(404, "not_found");

  const payload = {
    exportedAt: new Date().toISOString(),
    account: user.rows[0],
    pets: pets.rows,
    medications: medications.rows,
    doseLogs: doseLogs.rows,
  };

  recordAuditEvent(req.userId!, "data_exported", req, {});
  res.setHeader("Content-Disposition", "attachment; filename=\"dosed-data-export.json\"");
  res.json(payload);
}));

// --- account deletion (GDPR Art. 17 right to erasure) ---

const deleteAccountSchema = z.object({ password: z.string() });

// Step-up auth again (see /logout-all-devices for the same pattern):
// deleting the account is the single highest-consequence action in the
// app, so a still-valid access token isn't enough on its own.
//
// Order matters here: R2 objects are deleted *before* the DB row, while
// we still know which userId owns which photos. If this handler died
// between the two steps, the DB delete (which cascades to pets/
// medications/dose_logs via ON DELETE CASCADE, and refresh_tokens too —
// see migrations 001/002) is the one that actually removes the account,
// so a crash here would at worst orphan some R2 objects rather than
// leave a half-deleted, still-usable account behind.
accountRouter.delete("/me", requireAuth, ah(async (req: AuthedRequest, res) => {
  const { password } = deleteAccountSchema.parse(req.body);
  const { rows } = await pool.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [req.userId]);
  const ok = rows[0] && (await bcrypt.compare(password, rows[0].password_hash));
  if (!ok) throw new ApiError(401, "invalid_current_password");

  await deleteAllWithPrefix(`users/${req.userId}/`);

  // security_audit_log rows use ON DELETE SET NULL (migration 003), so
  // this specific event is recorded and then immediately loses its
  // user_id the moment the DELETE below runs — an anonymous record that
  // an account existed and was deleted, with nothing identifying left.
  recordAuditEvent(req.userId!, "account_deleted", req, {});
  await pool.query("DELETE FROM users WHERE id = $1", [req.userId]);

  res.status(204).end();
}));
