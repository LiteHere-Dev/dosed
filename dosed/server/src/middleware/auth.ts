import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";

export interface AuthedRequest extends Request {
  userId?: string;
}

// "token_expired" vs "invalid_token" is a deliberate distinction: the
// client's fetch wrapper retries automatically (via the refresh token)
// only on the former. Collapsing both into one error code would make
// silent, transparent refresh impossible to implement correctly.
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing_token" });
  }
  const result = verifyAccessToken(header.slice("Bearer ".length));
  if (!result.ok) {
    return res.status(401).json({ error: result.reason === "expired" ? "token_expired" : "invalid_token" });
  }
  req.userId = result.payload.userId;
  next();
}
