import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { pool } from "../db";
import { ah } from "../lib/asyncHandler";
import { ApiError } from "../middleware/error";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { sendMail } from "../lib/mailer";

export const notifyRouter = Router();
notifyRouter.use(requireAuth);

// Refill and vet-summary emails are user-triggered (a low-stock check on
// device, or a tap on "Email to vet"), not a bulk sender, so a generous
// limiter is only here to stop a runaway retry loop, not real usage.
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
notifyRouter.use(limiter);

// --- refill alert ---
// Sent to the pet's owner (whoever manages the prescription), regardless of
// whether the caller is the owner or an accepted caregiver who noticed the
// bottle running low.

const refillSchema = z.object({
  medicationId: z.string().uuid(),
  medicationName: z.string(),
  petName: z.string(),
  remainingQuantity: z.number(),
  unit: z.string(),
});

notifyRouter.post("/refill", ah(async (req: AuthedRequest, res) => {
  const body = refillSchema.parse(req.body);

  const { rows } = await pool.query<{ email: string }>(
    `SELECT u.email FROM medications m
     JOIN pets p ON p.id = m.pet_id
     JOIN users u ON u.id = p.user_id
     WHERE m.id = $1 AND (
       p.user_id = $2 OR EXISTS (SELECT 1 FROM pet_shares ps WHERE ps.pet_id = p.id AND ps.member_user_id = $2 AND ps.status = 'accepted')
     )`,
    [body.medicationId, req.userId]
  );
  const ownerEmail = rows[0]?.email;
  if (!ownerEmail) throw new ApiError(404, "medication_not_found");

  await sendMail(
    ownerEmail,
    `${body.petName}'s ${body.medicationName} is running low`,
    `${body.petName} has about ${body.remainingQuantity} ${body.unit} of ${body.medicationName} left. ` +
      `Time to request a refill before it runs out.`
  );

  res.json({ sent: true });
}));

// --- vet visit summary ---
// The client renders the same HTML used for the on-device PDF (see
// src/lib/export.ts) and posts it here as the email body, optionally with
// the PDF itself as a base64 attachment so the vet can also open a file.

const vetSummarySchema = z.object({
  petId: z.string().uuid(),
  vetEmail: z.string().trim().toLowerCase().email(),
  petName: z.string(),
  rangeLabel: z.string(),
  pdfBase64: z.string(),
});

notifyRouter.post("/vet-summary", ah(async (req: AuthedRequest, res) => {
  const body = vetSummarySchema.parse(req.body);

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM pets p WHERE p.id = $1 AND (
       p.user_id = $2 OR EXISTS (SELECT 1 FROM pet_shares ps WHERE ps.pet_id = p.id AND ps.member_user_id = $2 AND ps.status = 'accepted')
     )`,
    [body.petId, req.userId]
  );
  if (!rows[0]) throw new ApiError(404, "pet_not_found");

  // The PDF (built on-device with the same renderer used for local export —
  // see src/lib/export.ts) is the actual report; the email body is just a
  // short pointer to it, since mailer.ts sends plain text, not HTML.
  await sendMail(
    body.vetEmail,
    `${body.petName} — medication summary (${body.rangeLabel})`,
    `Attached is ${body.petName}'s medication adherence summary for ${body.rangeLabel}, sent from the Dosed app.`,
    [{ filename: `${body.petName.replace(/[^a-z0-9]/gi, "-")}-summary.pdf`, contentBase64: body.pdfBase64, contentType: "application/pdf" }]
  );

  res.json({ sent: true });
}));
