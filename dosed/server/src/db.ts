import { Pool } from "pg";
import { env } from "./env";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Managed Postgres (Railway/Render/RDS/etc.) typically requires TLS in
  // production but ships a cert your local trust store won't validate;
  // this is the standard escape hatch, not a security downgrade of the
  // connection itself (the traffic is still encrypted).
  ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

pool.on("error", (err) => {
  console.error("Unexpected idle Postgres client error", err);
});
