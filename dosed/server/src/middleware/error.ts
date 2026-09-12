import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { env } from "../env";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "validation_failed", details: err.issues });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.code });
  }
  console.error(err);
  // In production, never echo internal error details to the client.
  res.status(500).json({ error: "internal_error", ...(env.NODE_ENV !== "production" && { detail: String(err) }) });
}
