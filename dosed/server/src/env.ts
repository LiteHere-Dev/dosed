import "dotenv/config";
import { z } from "zod";

// Fail fast at boot rather than at the first request that needs a secret
// — a prod server with a missing JWT_SECRET should refuse to start, not
// serve unauthenticated tokens or crash on the first login attempt.
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGINS: z.string().default(""),
  // Optional: email sending. Left unset, the mailer logs to stdout instead
  // of failing — see lib/mailer.ts.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("Dosed <no-reply@example.com>"),
  // Base URL of a page/deep-link that can carry a reset/verify token —
  // used only inside the email body text. Defaults to this app's own
  // deep-link scheme + the auth screens that read the token
  // (app/auth/reset-password.tsx, app/auth/verify-email.tsx).
  APP_URL: z.string().default("dosed://auth/"),
  // R2 (S3-compatible) storage for pet photos — see lib/r2.ts. Optional:
  // if unset, the uploads routes 503 rather than crashing at boot, so a
  // dev without R2 configured can still run everything else.
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_ENDPOINT: z.string().optional(),
  R2_BUCKET: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:\n" + parsed.error.issues.map((i) => `  - ${i.path}: ${i.message}`).join("\n"));
  process.exit(1);
}

export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
