import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { pool } from "../db";
import { ah } from "../lib/asyncHandler";
import { ApiError } from "../middleware/error";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { issueTokenPair, registerFailedLogin, clearFailedLogins, isLocked, revokeAllSessions } from "../lib/authHelpers";
import { hashToken, generateOpaqueToken } from "../lib/tokens";
import { sendMail } from "../lib/mailer";
import { signAccessToken } from "../lib/jwt";
import { recordAuditEvent } from "../lib/audit";
import { env } from "../env";

export const authRouter = Router();

// Auth endpoints are the classic credential-stuffing/brute-force target —
// rate-limit them tighter than the rest of the API. This is in addition
// to, not instead of, the per-account lockout in authHelpers.ts: the
// limiter defends against spraying many accounts from one IP, the lockout
// defends against hammering one account from many IPs.
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
authRouter.use(authLimiter);

const usernamePattern = /^[a-zA-Z0-9_]{3,20}$/;
const phonePattern = /^\+?[1-9]\d{7,14}$/; // loose E.164-shaped check, not a full validation library

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  username: z.string().trim().regex(usernamePattern, "3-20 letters, numbers, or underscores"),
  phone: z.string().trim().regex(phonePattern, "Use international format, e.g. +26876123456").nullish(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  deviceLabel: z.string().max(100).nullish(),
});

authRouter.post("/register", ah(async (req, res) => {
  const { email, username, phone, password, deviceLabel } = registerSchema.parse(req.body);

  const clash = await pool.query(
    "SELECT email, phone FROM users WHERE email = $1 OR lower(username) = lower($2) OR ($3::text IS NOT NULL AND phone = $3)",
    [email, username, phone ?? null]
  );
  if (clash.rows.length > 0) throw new ApiError(409, "account_exists");

  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO users (email, username, phone, password_hash) VALUES ($1,$2,$3,$4) RETURNING id",
    [email, username, phone ?? null, passwordHash]
  );
  const userId = rows[0].id;

  await sendVerificationEmail(userId, email);
  const tokens = await issueTokenPair(userId, deviceLabel ?? null);
  recordAuditEvent(userId, "register", req, { username });
  res.status(201).json(tokens);
}));

const loginSchema = z.object({
  identifier: z.string().trim(), // email OR username
  password: z.string(),
  deviceLabel: z.string().max(100).nullish(),
});

authRouter.post("/login", ah(async (req, res) => {
  const { identifier, password, deviceLabel } = loginSchema.parse(req.body);
  const { rows } = await pool.query<{ id: string; password_hash: string; locked_until: Date | null }>(
    "SELECT id, password_hash, locked_until FROM users WHERE email = $1 OR lower(username) = lower($1)",
    [identifier.toLowerCase()]
  );
  const user = rows[0];

  if (user && isLocked(user.locked_until)) {
    recordAuditEvent(user.id, "account_locked", req, { identifier });
    throw new ApiError(423, "account_locked");
  }

  // Same error for "no such user" and "wrong password" — don't tell an
  // attacker which half of the guess was right.
  const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !ok) {
    if (user) await registerFailedLogin(user.id);
    recordAuditEvent(user?.id ?? null, "login_failed", req, { identifier });
    throw new ApiError(401, "invalid_credentials");
  }

  await clearFailedLogins(user.id);
  const tokens = await issueTokenPair(user.id, deviceLabel ?? null);
  recordAuditEvent(user.id, "login_success", req, { deviceLabel: deviceLabel ?? null });
  res.json(tokens);
}));

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

authRouter.post("/refresh", ah(async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const tokenHash = hashToken(refreshToken);

  const { rows } = await pool.query<{
    id: string; user_id: string; expires_at: Date; revoked_at: Date | null; replaced_by: string | null;
  }>("SELECT * FROM refresh_tokens WHERE token_hash = $1", [tokenHash]);
  const record = rows[0];

  if (!record) throw new ApiError(401, "invalid_refresh_token");

  // Reuse detection: a token that was already rotated (has replaced_by)
  // being presented again means either a race (harmless, ignorable) or a
  // stolen token being used after the legitimate client already rotated
  // past it (not harmless). Since telling those apart isn't possible from
  // the server alone, treat it as theft and revoke the whole session
  // family — the legitimate user just has to log in again, which is a
  // much smaller cost than leaving a stolen token family alive.
  if (record.replaced_by || record.revoked_at) {
    await revokeAllSessions(record.user_id);
    recordAuditEvent(record.user_id, "refresh_reuse_detected", req, {});
    throw new ApiError(401, "refresh_token_reused");
  }
  if (record.expires_at.getTime() < Date.now()) throw new ApiError(401, "refresh_token_expired");

  const accessToken = signAccessToken({ userId: record.user_id });
  const { plaintext, hash } = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + 60 * 86_400_000);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      "INSERT INTO refresh_tokens (user_id, token_hash, device_label, expires_at) VALUES ($1,$2,(SELECT device_label FROM refresh_tokens WHERE id = $3),$4) RETURNING id",
      [record.user_id, hash, record.id, expiresAt]
    );
    await client.query(
      "UPDATE refresh_tokens SET replaced_by = $1, last_used_at = now() WHERE id = $2",
      [inserted.rows[0].id, record.id]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  res.json({ accessToken, refreshToken: plaintext });
}));

authRouter.post("/logout", ah(async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1", [hashToken(refreshToken)]);
  res.status(204).end();
}));

// Step-up authentication ("sudo mode" pattern): signing out every device is
// exactly the kind of high-blast-radius action that should require proving
// you're still you right now, not just holding a still-valid access token
// from ten minutes ago. A stolen/borrowed unlocked phone can carry a valid
// access token; it can't carry a password you didn't type into it.
const logoutAllSchema = z.object({ password: z.string() });

authRouter.post("/logout-all", requireAuth, ah(async (req: AuthedRequest, res) => {
  const { password } = logoutAllSchema.parse(req.body);
  const { rows } = await pool.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [req.userId]);
  const ok = rows[0] && (await bcrypt.compare(password, rows[0].password_hash));
  if (!ok) throw new ApiError(401, "invalid_current_password");

  await revokeAllSessions(req.userId!);
  recordAuditEvent(req.userId!, "logout_all_devices", req, {});
  res.status(204).end();
}));

authRouter.get("/sessions", requireAuth, ah(async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT id, device_label as "deviceLabel", created_at as "createdAt", last_used_at as "lastUsedAt", expires_at as "expiresAt"
     FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC`,
    [req.userId]
  );
  res.json({ sessions: rows });
}));

authRouter.delete("/sessions/:id", requireAuth, ah(async (req: AuthedRequest, res) => {
  await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
  recordAuditEvent(req.userId!, "session_revoked", req, { sessionId: req.params.id });
  res.status(204).end();
}));

// --- email verification (used by register above, and account.ts's resend) ---

export async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  const { plaintext, hash } = generateOpaqueToken();
  await pool.query(
    "INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)",
    [userId, hash, new Date(Date.now() + 24 * 3600_000)]
  );
  const link = `${env.APP_URL}verify-email?token=${plaintext}`;
  await sendMail(email, "Verify your Dosed account", `Tap to verify your email:\n\n${link}\n\nExpires in 24 hours.`);
}
