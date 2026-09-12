import { pool } from "../db";
import { signAccessToken } from "./jwt";
import { generateOpaqueToken } from "./tokens";

const REFRESH_TTL_DAYS = 60;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function issueTokenPair(userId: string, deviceLabel: string | null) {
  const accessToken = signAccessToken({ userId });
  const { plaintext, hash } = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
  await pool.query(
    "INSERT INTO refresh_tokens (user_id, token_hash, device_label, expires_at) VALUES ($1,$2,$3,$4)",
    [userId, hash, deviceLabel, expiresAt]
  );
  return { accessToken, refreshToken: plaintext };
}

/**
 * Called after a failed password check. Locks the account for a fixed
 * window after MAX_FAILED_ATTEMPTS in a row — a simple, effective enough
 * defense against a naive brute force; see README for what a more
 * sophisticated (exponential, IP+account combined) version would add.
 */
export async function registerFailedLogin(userId: string): Promise<void> {
  const { rows } = await pool.query<{ failed_login_attempts: number }>(
    "UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1 RETURNING failed_login_attempts",
    [userId]
  );
  if ((rows[0]?.failed_login_attempts ?? 0) >= MAX_FAILED_ATTEMPTS) {
    await pool.query("UPDATE users SET locked_until = $2 WHERE id = $1", [
      userId, new Date(Date.now() + LOCKOUT_MINUTES * 60_000),
    ]);
  }
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await pool.query("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1", [userId]);
}

export function isLocked(lockedUntil: Date | null): boolean {
  return !!lockedUntil && lockedUntil.getTime() > Date.now();
}

/** Revokes every refresh token for a user — used on password change/reset and reuse-detection. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
}
