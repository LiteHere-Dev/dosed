import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { pool } from "../db";
import { ah } from "../lib/asyncHandler";
import { ApiError } from "../middleware/error";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { generateOpaqueToken, hashToken } from "../lib/tokens";
import { sendMail } from "../lib/mailer";
import { env } from "../env";

export const householdRouter = Router();
householdRouter.use(requireAuth);

const inviteLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

async function assertOwnsPet(petId: string, userId: string): Promise<{ name: string }> {
  const { rows } = await pool.query<{ name: string }>("SELECT name FROM pets WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL", [petId, userId]);
  if (!rows[0]) throw new ApiError(404, "pet_not_found");
  return rows[0];
}

// --- invite a caregiver ---

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(["caregiver"]).default("caregiver") });

householdRouter.post("/pets/:petId/invite", inviteLimiter, ah(async (req: AuthedRequest, res) => {
  const petId = req.params.petId;
  const { email, role } = inviteSchema.parse(req.body);
  const pet = await assertOwnsPet(petId, req.userId!);

  const { rows: ownerRows } = await pool.query<{ username: string }>("SELECT username FROM users WHERE id = $1", [req.userId]);
  const ownerName = ownerRows[0]?.username ?? "A Dosed user";

  const { plaintext, hash } = generateOpaqueToken();
  try {
    await pool.query(
      `INSERT INTO pet_shares (pet_id, owner_user_id, invited_email, role, invite_token_hash)
       VALUES ($1,$2,$3,$4,$5)`,
      [petId, req.userId, email, role, hash]
    );
  } catch (err: any) {
    // Unique index on (pet_id, lower(invited_email)) WHERE status='pending'
    if (err?.code === "23505") throw new ApiError(409, "invite_already_pending");
    throw err;
  }

  const acceptUrl = `${env.APP_URL}household-accept?token=${encodeURIComponent(plaintext)}`;
  await sendMail(
    email,
    `${ownerName} invited you to help care for ${pet.name} on Dosed`,
    `${ownerName} invited you to be a caregiver for ${pet.name} on Dosed, so you can both check off medication doses without double-dosing.\n\n` +
      `Open this link in the Dosed app to accept (you'll need an account with this email address, ${email}):\n${acceptUrl}\n\n` +
      `This invite expires in 7 days. If you weren't expecting this, you can ignore it.`
  );

  res.status(201).json({ invited: true });
}));

// --- accept an invite ---

const acceptSchema = z.object({ token: z.string().min(1) });

householdRouter.post("/accept", ah(async (req: AuthedRequest, res) => {
  const { token } = acceptSchema.parse(req.body);
  const { rows } = await pool.query<{
    id: string; pet_id: string; invited_email: string; status: string; expires_at: Date;
  }>("SELECT id, pet_id, invited_email, status, expires_at FROM pet_shares WHERE invite_token_hash = $1", [hashToken(token)]);
  const share = rows[0];
  if (!share || share.status !== "pending" || share.expires_at.getTime() < Date.now()) {
    throw new ApiError(400, "invalid_or_expired_invite");
  }

  const { rows: userRows } = await pool.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [req.userId]);
  if (userRows[0]?.email.toLowerCase() !== share.invited_email.toLowerCase()) {
    // Prevents accepting an invite meant for someone else's inbox just by
    // guessing/forwarding the link while signed into a different account.
    throw new ApiError(403, "invite_email_mismatch");
  }

  await pool.query("UPDATE pet_shares SET status = 'accepted', member_user_id = $2, accepted_at = now() WHERE id = $1", [share.id, req.userId]);
  // Bump the pet's updated_at so it's picked up on the caregiver's next
  // sync pull even though its own row (and its medications/dose_logs) may
  // be far older than the caregiver's last-pulled cursor — see sync.ts.
  await pool.query("UPDATE pets SET updated_at = now() WHERE id = $1", [share.pet_id]);

  res.json({ accepted: true, petId: share.pet_id });
}));

// --- manage members (owner only) ---

householdRouter.get("/pets/:petId/members", ah(async (req: AuthedRequest, res) => {
  await assertOwnsPet(req.params.petId, req.userId!);
  const { rows } = await pool.query(
    `SELECT id, invited_email as "invitedEmail", role, status, created_at as "createdAt", accepted_at as "acceptedAt"
     FROM pet_shares WHERE pet_id = $1 AND status != 'revoked' ORDER BY created_at DESC`,
    [req.params.petId]
  );
  res.json({ members: rows });
}));

householdRouter.delete("/pets/:petId/members/:shareId", ah(async (req: AuthedRequest, res) => {
  await assertOwnsPet(req.params.petId, req.userId!);
  await pool.query("UPDATE pet_shares SET status = 'revoked', revoked_at = now() WHERE id = $1 AND pet_id = $2", [req.params.shareId, req.params.petId]);
  res.status(204).end();
}));

// --- pets shared with me ---

householdRouter.get("/shared-with-me", ah(async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT ps.pet_id as "petId", p.name as "petName", u.username as "ownerName"
     FROM pet_shares ps JOIN pets p ON p.id = ps.pet_id JOIN users u ON u.id = ps.owner_user_id
     WHERE ps.member_user_id = $1 AND ps.status = 'accepted'`,
    [req.userId]
  );
  res.json({ pets: rows });
}));
