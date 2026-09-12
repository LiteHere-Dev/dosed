import { env, corsOrigins } from "./env";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { authRouter } from "./routes/auth";
import { accountRouter } from "./routes/account";
import { syncRouter } from "./routes/sync";
import { uploadsRouter } from "./routes/uploads";
import { errorHandler } from "./middleware/error";
import { pool } from "./db";

const app = express();

// Required for express-rate-limit (and any IP-based logic) to see the
// real client IP rather than the load balancer's, when running behind
// one — true of every host in the README's deploy section.
app.set("trust proxy", 1);

app.use(helmet());
// No origin list configured -> mobile clients (no Origin header) still
// work; a same-origin browser is irrelevant to this API either way.
app.use(cors(corsOrigins.length ? { origin: corsOrigins } : {}));
app.use(express.json({ limit: "2mb" }));
app.use(pinoHttp({ redact: ["req.headers.authorization"] }));

// Generous global ceiling; auth/reset routes carry their own tighter
// limiters on top of this (see routes/auth.ts, routes/account.ts).
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/account", accountRouter);
app.use("/api/sync", syncRouter);
app.use("/api/uploads", uploadsRouter);

app.use(errorHandler);

// Expired/revoked tokens are harmless but pointless to keep forever —
// sweep them hourly rather than running a separate cron service for a
// one-line query.
setInterval(() => {
  pool.query(
    "DELETE FROM refresh_tokens WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'"
  ).catch((err) => console.error("token cleanup failed", err));
}, 3600_000);

app.listen(env.PORT, () => {
  console.log(`dosed-server listening on :${env.PORT} (${env.NODE_ENV})`);
});
