import type { Request } from "express";
import { pool } from "../db";

export type AuditEventType =
  | "register" | "login_success" | "login_failed" | "account_locked"
  | "refresh_reuse_detected" | "password_changed" | "password_reset_requested"
  | "password_reset_completed" | "email_verified" | "logout_all_devices" | "session_revoked"
  | "data_exported" | "account_deleted";

/**
 * Fire-and-forget on purpose: a security event failing to log should never
 * be the reason a login or password change itself fails for the user.
 * Errors are swallowed here (and only here) rather than propagated.
 */
export function recordAuditEvent(
  userId: string | null,
  eventType: AuditEventType,
  req: Request,
  metadata: Record<string, unknown> = {}
): void {
  pool.query(
    "INSERT INTO security_audit_log (user_id, event_type, ip_address, user_agent, metadata) VALUES ($1,$2,$3,$4,$5)",
    [userId, eventType, req.ip ?? null, req.headers["user-agent"] ?? null, JSON.stringify(metadata)]
  ).catch((err) => console.error("audit log write failed", err));
}
