import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { ah } from "../lib/asyncHandler";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { r2Configured, presignUpload, getObject, deleteObject } from "../lib/r2";

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

const presignSchema = z.object({ petId: z.string().uuid(), ext: z.enum(["jpg", "png"]).default("jpg") });
const contentTypeFor = (ext: "jpg" | "png") => (ext === "png" ? "image/png" : "image/jpeg");

// Key is scoped under the caller's own userId, so ownership is just a path
// prefix check on the way out — no separate "who owns this photo" table.
uploadsRouter.post("/presign", ah(async (req: AuthedRequest, res) => {
  if (!r2Configured) return res.status(503).json({ error: "storage_not_configured" });
  const { petId, ext } = presignSchema.parse(req.body);
  const key = `users/${req.userId}/pets/${petId}/${randomUUID()}.${ext}`;
  const contentType = contentTypeFor(ext);
  const uploadUrl = await presignUpload(key, contentType);
  // contentType is returned so the client sends the exact header value
  // that was signed into the URL — R2 rejects the PUT if they don't match.
  res.json({ uploadUrl, key, contentType });
}));

// Streams the object back through the server rather than handing out a
// long-lived public URL — bucket stays private, auth is just requireAuth
// plus the path-prefix check below.
uploadsRouter.get("/:key(*)", ah(async (req: AuthedRequest, res) => {
  if (!r2Configured) return res.status(503).json({ error: "storage_not_configured" });
  const key = req.params.key;
  if (!key.startsWith(`users/${req.userId}/`)) return res.status(403).json({ error: "forbidden" });

  const upstream = await getObject(key);
  if (!upstream.ok) return res.status(upstream.status === 404 ? 404 : 502).json({ error: "fetch_failed" });
  res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");
  res.setHeader("Cache-Control", "private, max-age=86400");
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.send(buf);
}));

// Same ownership check as the GET route — path prefix is the only ACL
// this needs, no separate "who owns this photo" table.
uploadsRouter.delete("/:key(*)", ah(async (req: AuthedRequest, res) => {
  if (!r2Configured) return res.status(503).json({ error: "storage_not_configured" });
  const key = req.params.key;
  if (!key.startsWith(`users/${req.userId}/`)) return res.status(403).json({ error: "forbidden" });
  await deleteObject(key);
  res.status(204).end();
}));
