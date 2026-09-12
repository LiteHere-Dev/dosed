import jwt from "jsonwebtoken";
import { env } from "../env";

export interface TokenPayload {
  userId: string;
}

const ISSUER = "dosed-server";
const AUDIENCE = "dosed-app";

// Short-lived on purpose (15 min): this is the token sent on every request,
// so its blast radius if intercepted is small. Long-lived reachability
// lives in the refresh token instead, which is opaque, hashed at rest,
// and individually revocable — unlike a JWT, which is valid until it
// expires no matter what the server does.
export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "15m", issuer: ISSUER, audience: AUDIENCE });
}

export type VerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: "expired" | "invalid" };

export function verifyAccessToken(token: string): VerifyResult {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER, audience: AUDIENCE }) as TokenPayload;
    return { ok: true, payload };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return { ok: false, reason: "expired" };
    return { ok: false, reason: "invalid" };
  }
}
