import { randomBytes, createHash } from "node:crypto";

/**
 * Refresh/verification/reset tokens are opaque random strings, not JWTs:
 * the only way to use one is to present the exact string, and the only
 * copy of it that exists after this function returns is whatever the
 * caller does with it (send it to the client). The database stores just
 * the hash, so a DB dump alone never yields a usable token.
 */
export function generateOpaqueToken(): { plaintext: string; hash: string } {
  const plaintext = randomBytes(32).toString("base64url");
  return { plaintext, hash: hashToken(plaintext) };
}

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}
