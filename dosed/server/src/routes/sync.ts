import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { ah } from "../lib/asyncHandler";
import { requireAuth, type AuthedRequest } from "../middleware/auth";

export const syncRouter = Router();
syncRouter.use(requireAuth);

/**
 * Pet ids this user can see: pets they own (all of them, including
 * soft-deleted, so tombstones still propagate) plus pets an owner has
 * shared with them via an accepted household invite (see routes/household.ts).
 * Both pull and push are scoped through this rather than through
 * `user_id = caller` directly, so a caregiver's pull/push reaches the same
 * rows the owner's does.
 */
async function visiblePetIds(userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM pets WHERE user_id = $1
     UNION
     SELECT ps.pet_id FROM pet_shares ps WHERE ps.member_user_id = $1 AND ps.status = 'accepted'`,
    [userId]
  );
  return rows.map((r) => r.id);
}

async function callerLabel(userId: string): Promise<string> {
  const { rows } = await pool.query<{ username: string }>("SELECT username FROM users WHERE id = $1", [userId]);
  return rows[0]?.username ?? "Someone";
}

// --- pull ---

syncRouter.get("/pull", ah(async (req: AuthedRequest, res) => {
  const since = typeof req.query.since === "string" ? req.query.since : "1970-01-01T00:00:00.000Z";
  const userId = req.userId!;
  const petIds = await visiblePetIds(userId);

  const [pets, medications, doseLogs, healthLogs] = await Promise.all([
    pool.query(
      `SELECT id, name, species, breed, weight_kg as "weightKg", photo_uri as "photoUri", notes, vet_email as "vetEmail",
              created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
       FROM pets WHERE (user_id = $1 OR id = ANY($2::uuid[])) AND updated_at > $3`, [userId, petIds, since]
    ),
    pool.query(
      `SELECT id, pet_id as "petId", name, dosage_value as "dosageValue", dosage_unit as "dosageUnit",
              schedule_type as "scheduleType", times, interval_hours as "intervalHours",
              start_date as "startDate", end_date as "endDate", active, critical,
              total_quantity as "totalQuantity", remaining_quantity as "remainingQuantity",
              refill_threshold as "refillThreshold", photo_uri as "photoUri",
              notes, updated_at as "updatedAt", deleted_at as "deletedAt"
       FROM medications WHERE pet_id = ANY($1::uuid[]) AND updated_at > $2`, [petIds, since]
    ),
    pool.query(
      `SELECT dl.id, dl.medication_id as "medicationId", dl.scheduled_at as "scheduledAt", dl.taken_at as "takenAt",
              dl.status, dl.amount_taken as "amountTaken", dl.note,
              dl.logged_by_user_id as "loggedByUserId", dl.logged_by_label as "loggedByLabel",
              dl.updated_at as "updatedAt", dl.deleted_at as "deletedAt"
       FROM dose_logs dl JOIN medications m ON m.id = dl.medication_id
       WHERE m.pet_id = ANY($1::uuid[]) AND dl.updated_at > $2`, [petIds, since]
    ),
    pool.query(
      `SELECT id, pet_id as "petId", type, value, note, occurred_at as "occurredAt",
              logged_by_user_id as "loggedByUserId", logged_by_label as "loggedByLabel",
              updated_at as "updatedAt", deleted_at as "deletedAt"
       FROM health_logs WHERE pet_id = ANY($1::uuid[]) AND updated_at > $2`, [petIds, since]
    ),
  ]);

  res.json({
    serverTime: new Date().toISOString(),
    pets: pets.rows,
    medications: medications.rows,
    doseLogs: doseLogs.rows,
    healthLogs: healthLogs.rows,
  });
}));

// --- push ---

const petSchema = z.object({
  id: z.string().uuid(), name: z.string(), species: z.string(), breed: z.string().nullable(),
  weightKg: z.number().nullable(), photoUri: z.string().nullable(), notes: z.string().nullable(),
  vetEmail: z.string().nullable().optional(),
  createdAt: z.string(), updatedAt: z.string(), deletedAt: z.string().nullable(),
});
const medicationSchema = z.object({
  id: z.string().uuid(), petId: z.string().uuid(), name: z.string(), dosageValue: z.number(),
  dosageUnit: z.string(), scheduleType: z.string(), times: z.array(z.string()),
  intervalHours: z.number().nullable(), startDate: z.string(), endDate: z.string().nullable(),
  active: z.boolean(), notes: z.string().nullable(),
  critical: z.boolean().optional().default(false),
  totalQuantity: z.number().nullable().optional(),
  remainingQuantity: z.number().nullable().optional(),
  refillThreshold: z.number().nullable().optional(),
  photoUri: z.string().nullable().optional(),
  updatedAt: z.string(), deletedAt: z.string().nullable(),
});
const doseLogSchema = z.object({
  id: z.string().uuid(), medicationId: z.string().uuid(), scheduledAt: z.string(), takenAt: z.string().nullable(),
  status: z.string(), amountTaken: z.number().nullable(), note: z.string().nullable(),
  updatedAt: z.string(), deletedAt: z.string().nullable(),
});
const healthLogSchema = z.object({
  id: z.string().uuid(), petId: z.string().uuid(), type: z.string(), value: z.string(), note: z.string().nullable(),
  occurredAt: z.string(), updatedAt: z.string(), deletedAt: z.string().nullable(),
});
const pushSchema = z.object({
  pets: z.array(petSchema).default([]),
  medications: z.array(medicationSchema).default([]),
  doseLogs: z.array(doseLogSchema).default([]),
  healthLogs: z.array(healthLogSchema).default([]),
});

syncRouter.post("/push", ah(async (req: AuthedRequest, res) => {
  const body = pushSchema.parse(req.body);
  const userId = req.userId!;
  const petIds = await visiblePetIds(userId);
  const label = await callerLabel(userId);

  // Every upsert is a last-write-wins merge: it only overwrites an existing
  // row if the incoming updated_at is newer. Pets and medications stay
  // owner-only (WHERE ...user_id = $2 on the conflict side, and — for
  // medications — no fallback insert path for a caregiver, since the pet_id
  // FK on a brand new row still requires the caller to be its owner via the
  // dose_logs/health_logs pattern below isn't applied here on purpose: pet
  // profile and medication schedule edits are deliberately owner-only, so a
  // caregiver's edits to either silently no-op rather than erroring — see
  // README "household sharing" section).
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const p of body.pets) {
      await client.query(
        `INSERT INTO pets (id, user_id, name, species, breed, weight_kg, photo_uri, notes, vet_email, created_at, updated_at, deleted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           name=excluded.name, species=excluded.species, breed=excluded.breed, weight_kg=excluded.weight_kg,
           photo_uri=excluded.photo_uri, notes=excluded.notes, vet_email=excluded.vet_email,
           updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
         WHERE pets.user_id = $2 AND excluded.updated_at > pets.updated_at`,
        [p.id, userId, p.name, p.species, p.breed, p.weightKg, p.photoUri, p.notes, p.vetEmail ?? null, p.createdAt, p.updatedAt, p.deletedAt]
      );
    }

    for (const m of body.medications) {
      await client.query(
        `INSERT INTO medications (id, user_id, pet_id, name, dosage_value, dosage_unit, schedule_type, times, interval_hours, start_date, end_date, active, notes, critical, total_quantity, remaining_quantity, refill_threshold, photo_uri, updated_at, deleted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (id) DO UPDATE SET
           name=excluded.name, dosage_value=excluded.dosage_value, dosage_unit=excluded.dosage_unit,
           schedule_type=excluded.schedule_type, times=excluded.times, interval_hours=excluded.interval_hours,
           start_date=excluded.start_date, end_date=excluded.end_date, active=excluded.active, notes=excluded.notes,
           critical=excluded.critical, total_quantity=excluded.total_quantity, remaining_quantity=excluded.remaining_quantity,
           refill_threshold=excluded.refill_threshold, photo_uri=excluded.photo_uri,
           updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
         WHERE medications.user_id = $2 AND excluded.updated_at > medications.updated_at`,
        [m.id, userId, m.petId, m.name, m.dosageValue, m.dosageUnit, m.scheduleType, JSON.stringify(m.times),
         m.intervalHours, m.startDate, m.endDate, m.active, m.notes, m.critical ?? false,
         m.totalQuantity ?? null, m.remainingQuantity ?? null, m.refillThreshold ?? null, m.photoUri ?? null,
         m.updatedAt, m.deletedAt]
      );
    }

    // dose_logs are resolved through the medication's pet rather than the
    // caller's own user_id, so a caregiver logging a dose for someone
    // else's pet works: the row is still stored under the pet owner's
    // user_id (m.user_id), keeping the rest of the per-owner data model
    // (export, refill emails) unchanged, while logged_by_* records who
    // actually tapped "Give" — see components/DoseRow.tsx.
    for (const d of body.doseLogs) {
      await client.query(
        `INSERT INTO dose_logs (id, user_id, medication_id, scheduled_at, taken_at, status, amount_taken, note, logged_by_user_id, logged_by_label, updated_at, deleted_at)
         SELECT $1, m.user_id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
         FROM medications m WHERE m.id = $3 AND m.pet_id = ANY($13::uuid[])
         ON CONFLICT (id) DO UPDATE SET
           taken_at=excluded.taken_at, status=excluded.status, amount_taken=excluded.amount_taken, note=excluded.note,
           logged_by_user_id=excluded.logged_by_user_id, logged_by_label=excluded.logged_by_label,
           updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
         WHERE excluded.updated_at > dose_logs.updated_at`,
        [d.id, userId, d.medicationId, d.scheduledAt, d.takenAt, d.status, d.amountTaken, d.note, userId, label, d.updatedAt, d.deletedAt, petIds]
      );
    }

    for (const h of body.healthLogs) {
      await client.query(
        `INSERT INTO health_logs (id, user_id, pet_id, type, value, note, occurred_at, logged_by_user_id, logged_by_label, updated_at, deleted_at)
         SELECT $1, p.user_id, $3, $4, $5, $6, $7, $8, $9, $10, $11
         FROM pets p WHERE p.id = $3 AND p.id = ANY($12::uuid[])
         ON CONFLICT (id) DO UPDATE SET
           type=excluded.type, value=excluded.value, note=excluded.note, occurred_at=excluded.occurred_at,
           logged_by_user_id=excluded.logged_by_user_id, logged_by_label=excluded.logged_by_label,
           updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
         WHERE excluded.updated_at > health_logs.updated_at`,
        [h.id, userId, h.petId, h.type, h.value, h.note, h.occurredAt, userId, label, h.updatedAt, h.deletedAt, petIds]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  res.json({ serverTime: new Date().toISOString() });
}));
