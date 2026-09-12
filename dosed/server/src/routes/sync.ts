import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { ah } from "../lib/asyncHandler";
import { requireAuth, type AuthedRequest } from "../middleware/auth";

export const syncRouter = Router();
syncRouter.use(requireAuth);

// --- pull ---

syncRouter.get("/pull", ah(async (req: AuthedRequest, res) => {
  const since = typeof req.query.since === "string" ? req.query.since : "1970-01-01T00:00:00.000Z";
  const userId = req.userId!;

  const [pets, medications, doseLogs] = await Promise.all([
    pool.query(
      `SELECT id, name, species, breed, weight_kg as "weightKg", photo_uri as "photoUri", notes,
              created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
       FROM pets WHERE user_id = $1 AND updated_at > $2`, [userId, since]
    ),
    pool.query(
      `SELECT id, pet_id as "petId", name, dosage_value as "dosageValue", dosage_unit as "dosageUnit",
              schedule_type as "scheduleType", times, interval_hours as "intervalHours",
              start_date as "startDate", end_date as "endDate", active,
              notes, updated_at as "updatedAt", deleted_at as "deletedAt"
       FROM medications WHERE user_id = $1 AND updated_at > $2`, [userId, since]
    ),
    pool.query(
      `SELECT id, medication_id as "medicationId", scheduled_at as "scheduledAt", taken_at as "takenAt",
              status, amount_taken as "amountTaken", note, updated_at as "updatedAt", deleted_at as "deletedAt"
       FROM dose_logs WHERE user_id = $1 AND updated_at > $2`, [userId, since]
    ),
  ]);

  res.json({
    serverTime: new Date().toISOString(),
    pets: pets.rows,
    medications: medications.rows,
    doseLogs: doseLogs.rows,
  });
}));

// --- push ---

const petSchema = z.object({
  id: z.string().uuid(), name: z.string(), species: z.string(), breed: z.string().nullable(),
  weightKg: z.number().nullable(), photoUri: z.string().nullable(), notes: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(), deletedAt: z.string().nullable(),
});
const medicationSchema = z.object({
  id: z.string().uuid(), petId: z.string().uuid(), name: z.string(), dosageValue: z.number(),
  dosageUnit: z.string(), scheduleType: z.string(), times: z.array(z.string()),
  intervalHours: z.number().nullable(), startDate: z.string(), endDate: z.string().nullable(),
  active: z.boolean(), notes: z.string().nullable(), updatedAt: z.string(), deletedAt: z.string().nullable(),
});
const doseLogSchema = z.object({
  id: z.string().uuid(), medicationId: z.string().uuid(), scheduledAt: z.string(), takenAt: z.string().nullable(),
  status: z.string(), amountTaken: z.number().nullable(), note: z.string().nullable(),
  updatedAt: z.string(), deletedAt: z.string().nullable(),
});
const pushSchema = z.object({
  pets: z.array(petSchema).default([]),
  medications: z.array(medicationSchema).default([]),
  doseLogs: z.array(doseLogSchema).default([]),
});

syncRouter.post("/push", ah(async (req: AuthedRequest, res) => {
  const body = pushSchema.parse(req.body);
  const userId = req.userId!;

  // Every upsert is a last-write-wins merge: it only overwrites an existing
  // row if the incoming updated_at is newer, so a push from a device that's
  // behind can never clobber a more recent edit from another device.
  // WHERE user_id = $ on the update side also means one user can never
  // overwrite another's row even if a client somehow sent a foreign id.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const p of body.pets) {
      await client.query(
        `INSERT INTO pets (id, user_id, name, species, breed, weight_kg, photo_uri, notes, created_at, updated_at, deleted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET
           name=excluded.name, species=excluded.species, breed=excluded.breed, weight_kg=excluded.weight_kg,
           photo_uri=excluded.photo_uri, notes=excluded.notes, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
         WHERE pets.user_id = $2 AND excluded.updated_at > pets.updated_at`,
        [p.id, userId, p.name, p.species, p.breed, p.weightKg, p.photoUri, p.notes, p.createdAt, p.updatedAt, p.deletedAt]
      );
    }

    for (const m of body.medications) {
      await client.query(
        `INSERT INTO medications (id, user_id, pet_id, name, dosage_value, dosage_unit, schedule_type, times, interval_hours, start_date, end_date, active, notes, updated_at, deleted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (id) DO UPDATE SET
           name=excluded.name, dosage_value=excluded.dosage_value, dosage_unit=excluded.dosage_unit,
           schedule_type=excluded.schedule_type, times=excluded.times, interval_hours=excluded.interval_hours,
           start_date=excluded.start_date, end_date=excluded.end_date, active=excluded.active, notes=excluded.notes,
           updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
         WHERE medications.user_id = $2 AND excluded.updated_at > medications.updated_at`,
        [m.id, userId, m.petId, m.name, m.dosageValue, m.dosageUnit, m.scheduleType, JSON.stringify(m.times),
         m.intervalHours, m.startDate, m.endDate, m.active, m.notes, m.updatedAt, m.deletedAt]
      );
    }

    for (const d of body.doseLogs) {
      await client.query(
        `INSERT INTO dose_logs (id, user_id, medication_id, scheduled_at, taken_at, status, amount_taken, note, updated_at, deleted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           taken_at=excluded.taken_at, status=excluded.status, amount_taken=excluded.amount_taken, note=excluded.note,
           updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
         WHERE dose_logs.user_id = $2 AND excluded.updated_at > dose_logs.updated_at`,
        [d.id, userId, d.medicationId, d.scheduledAt, d.takenAt, d.status, d.amountTaken, d.note, d.updatedAt, d.deletedAt]
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
