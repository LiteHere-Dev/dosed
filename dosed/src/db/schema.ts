import * as SQLite from "expo-sqlite";
import type { Pet, Medication, DoseLog, DoseStatus, HealthLog } from "./types";

let db: SQLite.SQLiteDatabase | null = null;

// One repository module, function-per-query. No repository *class*, no
// interface with a single implementation — there is exactly one storage
// backend and no plan to swap it, so an abstraction layer would be
// speculative (ponytail rung 1: does this need to exist at all?).
export async function getDb() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("dosed.db");
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await migrate(db);
  return db;
}

/** Wipes the local DB and closes the connection — used on sign-out. */
export async function resetDb() {
  const d = await getDb();
  await d.closeAsync();
  await SQLite.deleteDatabaseAsync("dosed.db");
  db = null;
}

async function migrate(d: SQLite.SQLiteDatabase) {
  await d.execAsync(`CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);`);
  const row = await d.getFirstAsync<{ version: number }>(
    "SELECT COALESCE(MAX(version),0) as version FROM schema_meta"
  );
  let version = row?.version ?? 0;

  if (version < 1) {
    await d.execAsync(`
      CREATE TABLE pets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        species TEXT NOT NULL,
        breed TEXT,
        weightKg REAL,
        photoUri TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE medications (
        id TEXT PRIMARY KEY,
        petId TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        dosageValue REAL NOT NULL,
        dosageUnit TEXT NOT NULL,
        scheduleType TEXT NOT NULL,
        times TEXT NOT NULL,
        intervalHours REAL,
        startDate TEXT NOT NULL,
        endDate TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        notes TEXT
      );
      CREATE TABLE dose_logs (
        id TEXT PRIMARY KEY,
        medicationId TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
        scheduledAt TEXT NOT NULL,
        takenAt TEXT,
        status TEXT NOT NULL,
        amountTaken REAL,
        note TEXT
      );
      CREATE INDEX idx_meds_pet ON medications(petId);
      CREATE INDEX idx_logs_med_time ON dose_logs(medicationId, scheduledAt);
    `);
    version = 1;
  }

  if (version < 2) {
    // Adds sync bookkeeping: updatedAt drives last-write-wins merges,
    // deletedAt is a tombstone so a delete on one device removes the row
    // on others instead of just disappearing locally. Backfill updatedAt
    // from createdAt/now so existing local rows sync cleanly.
    await d.execAsync(`
      ALTER TABLE pets ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
      ALTER TABLE pets ADD COLUMN deletedAt TEXT;
      ALTER TABLE medications ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
      ALTER TABLE medications ADD COLUMN deletedAt TEXT;
      ALTER TABLE dose_logs ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
      ALTER TABLE dose_logs ADD COLUMN deletedAt TEXT;
      UPDATE pets SET updatedAt = createdAt;
      CREATE TABLE sync_meta (
        id INTEGER PRIMARY KEY CHECK (id = 0),
        lastPulledAt TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
        lastPushedAt TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'
      );
      INSERT INTO sync_meta (id, lastPulledAt, lastPushedAt) VALUES (0, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z');
    `);
    version = 2;
  }

  if (version < 3) {
    // Smart adherence (critical-dose escalation, refill tracking, prescription
    // photo), household sharing attribution, and health logs (side effects /
    // mood / weight / stool quick-logs) — see README "recent features".
    await d.execAsync(`
      ALTER TABLE pets ADD COLUMN vetEmail TEXT;
      ALTER TABLE medications ADD COLUMN critical INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE medications ADD COLUMN totalQuantity REAL;
      ALTER TABLE medications ADD COLUMN remainingQuantity REAL;
      ALTER TABLE medications ADD COLUMN refillThreshold REAL;
      ALTER TABLE medications ADD COLUMN photoUri TEXT;
      ALTER TABLE dose_logs ADD COLUMN loggedByUserId TEXT;
      ALTER TABLE dose_logs ADD COLUMN loggedByLabel TEXT;
      CREATE TABLE health_logs (
        id TEXT PRIMARY KEY,
        petId TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        value TEXT NOT NULL,
        note TEXT,
        occurredAt TEXT NOT NULL,
        loggedByUserId TEXT,
        loggedByLabel TEXT,
        updatedAt TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
        deletedAt TEXT
      );
      CREATE INDEX idx_health_logs_pet_time ON health_logs(petId, occurredAt);
    `);
    version = 3;
  }

  await d.runAsync("DELETE FROM schema_meta");
  await d.runAsync("INSERT INTO schema_meta (version) VALUES (?)", version);
}

// crypto.randomUUID is available globally on most Expo SDK 49+ runtimes,
// but not guaranteed on every Hermes/Expo Go combination — it throws
// "Property 'crypto' doesn't exist" there instead of just being undefined,
// so a simple `?. ` guard isn't enough. Fall back to a Math.random-based
// v4-shaped UUID: not cryptographically secure, but these ids are only
// ever local primary keys, never used for anything security-sensitive.
const uuid = (): string => {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
const now = () => new Date().toISOString();

// --- Pets ---

export async function listPets(): Promise<Pet[]> {
  const d = await getDb();
  return d.getAllAsync<Pet>("SELECT * FROM pets WHERE deletedAt IS NULL ORDER BY createdAt ASC");
}

export async function getPet(id: string): Promise<Pet | null> {
  const d = await getDb();
  return d.getFirstAsync<Pet>("SELECT * FROM pets WHERE id = ?", id);
}

export async function createPet(input: Omit<Pet, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Pet> {
  const d = await getDb();
  const pet: Pet = { ...input, id: uuid(), createdAt: now(), updatedAt: now(), deletedAt: null };
  await d.runAsync(
    "INSERT INTO pets (id, name, species, breed, weightKg, photoUri, notes, vetEmail, createdAt, updatedAt, deletedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    pet.id, pet.name, pet.species, pet.breed, pet.weightKg, pet.photoUri, pet.notes, pet.vetEmail, pet.createdAt, pet.updatedAt, pet.deletedAt
  );
  return pet;
}

/** Sets photoUri after a successful upload (see src/lib/photos.ts) — separate from createPet since the upload happens after the pet already exists locally. */
export async function setPetPhoto(id: string, photoUri: string): Promise<void> {
  const d = await getDb();
  await d.runAsync("UPDATE pets SET photoUri = ?, updatedAt = ? WHERE id = ?", photoUri, now(), id);
}

/** Edits a pet's details. Stamps updatedAt so the change syncs (last-write-wins) to the person's other devices. */
export async function updatePet(
  id: string,
  patch: Partial<Pick<Pet, "name" | "species" | "breed" | "weightKg" | "photoUri" | "notes" | "vetEmail">>
): Promise<void> {
  const d = await getDb();
  const cols = Object.keys(patch) as (keyof typeof patch)[];
  if (cols.length === 0) return;
  const sets = cols.map((c) => `${c} = ?`).join(", ");
  const values = cols.map((c) => patch[c] as string | number | null);
  await d.runAsync(`UPDATE pets SET ${sets}, updatedAt = ? WHERE id = ?`, ...values, now(), id);
}

/** Applied by the sync engine when pulling a pet from the server — LWW, never regresses a newer local edit. */
export async function upsertPetFromServer(pet: Pet): Promise<void> {  const d = await getDb();
  await d.runAsync(
    `INSERT INTO pets (id, name, species, breed, weightKg, photoUri, notes, vetEmail, createdAt, updatedAt, deletedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, species=excluded.species, breed=excluded.breed, weightKg=excluded.weightKg,
       photoUri=excluded.photoUri, notes=excluded.notes, vetEmail=excluded.vetEmail,
       updatedAt=excluded.updatedAt, deletedAt=excluded.deletedAt
     WHERE excluded.updatedAt > pets.updatedAt`,
    pet.id, pet.name, pet.species, pet.breed, pet.weightKg, pet.photoUri, pet.notes, pet.vetEmail, pet.createdAt, pet.updatedAt, pet.deletedAt
  );
}

// --- Medications ---

export async function listMedications(petId: string): Promise<Medication[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    "SELECT * FROM medications WHERE petId = ? AND deletedAt IS NULL ORDER BY active DESC, name ASC", petId
  );
  return rows.map(rowToMedication);
}

export async function getMedication(id: string): Promise<Medication | null> {
  const d = await getDb();
  const row = await d.getFirstAsync<any>("SELECT * FROM medications WHERE id = ?", id);
  return row ? rowToMedication(row) : null;
}

export async function listActiveMedications(): Promise<Medication[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>("SELECT * FROM medications WHERE active = 1 AND deletedAt IS NULL");
  return rows.map(rowToMedication);
}

function rowToMedication(row: any): Medication {
  return { ...row, times: JSON.parse(row.times), active: !!row.active, critical: !!row.critical };
}

export async function createMedication(input: Omit<Medication, "id" | "updatedAt" | "deletedAt">): Promise<Medication> {
  const d = await getDb();
  const med: Medication = { ...input, id: uuid(), updatedAt: now(), deletedAt: null };
  await d.runAsync(
    `INSERT INTO medications
      (id, petId, name, dosageValue, dosageUnit, scheduleType, times, intervalHours, startDate, endDate, active, notes,
       critical, totalQuantity, remainingQuantity, refillThreshold, photoUri, updatedAt, deletedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    med.id, med.petId, med.name, med.dosageValue, med.dosageUnit, med.scheduleType,
    JSON.stringify(med.times), med.intervalHours, med.startDate, med.endDate, med.active ? 1 : 0, med.notes,
    med.critical ? 1 : 0, med.totalQuantity, med.remainingQuantity, med.refillThreshold, med.photoUri,
    med.updatedAt, med.deletedAt
  );
  return med;
}

export async function setMedicationActive(id: string, active: boolean) {
  const d = await getDb();
  await d.runAsync("UPDATE medications SET active = ?, updatedAt = ? WHERE id = ?", active ? 1 : 0, now(), id);
}

/** Edits a medication's own fields (critical flag, refill tracking, photo, notes, etc). Doesn't touch schedule fields — reschedule notifications separately if those change. */
export async function updateMedication(
  id: string,
  patch: Partial<Pick<Medication, "name" | "dosageValue" | "dosageUnit" | "notes" | "critical" | "totalQuantity" | "remainingQuantity" | "refillThreshold" | "photoUri">>
): Promise<void> {
  const d = await getDb();
  const cols = Object.keys(patch) as (keyof typeof patch)[];
  if (cols.length === 0) return;
  const sets = cols.map((c) => `${c} = ?`).join(", ");
  const values = cols.map((c) => {
    const v = patch[c];
    return typeof v === "boolean" ? (v ? 1 : 0) : (v as string | number | null | undefined) ?? null;
  });
  await d.runAsync(`UPDATE medications SET ${sets}, updatedAt = ? WHERE id = ?`, ...values, now(), id);
}

/**
 * Logs a dose as taken/partial and, if the medication tracks quantity,
 * decrements remainingQuantity by the amount given. Returns whether this
 * decrement just crossed the refill threshold (from above it to at/below
 * it) so the caller can fire a refill alert exactly once — see
 * src/lib/refill.ts.
 */
export async function recordDoseAndDecrement(
  medicationId: string,
  scheduledAt: string,
  status: DoseStatus,
  amountTaken?: number
): Promise<{ crossedRefillThreshold: boolean; medication: Medication | null }> {
  await upsertDoseStatus(medicationId, scheduledAt, status, amountTaken);
  const med = await getMedication(medicationId);
  if (!med || med.remainingQuantity == null || (status !== "taken" && status !== "partial")) {
    return { crossedRefillThreshold: false, medication: med };
  }
  const used = amountTaken ?? med.dosageValue;
  const before = med.remainingQuantity;
  const after = Math.max(0, before - used);
  await updateMedication(medicationId, { remainingQuantity: after });
  const threshold = med.refillThreshold;
  const crossed = threshold != null && before > threshold && after <= threshold;
  return { crossedRefillThreshold: crossed, medication: { ...med, remainingQuantity: after } };
}

export async function upsertMedicationFromServer(med: Medication): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    `INSERT INTO medications (id, petId, name, dosageValue, dosageUnit, scheduleType, times, intervalHours, startDate, endDate, active, notes,
       critical, totalQuantity, remainingQuantity, refillThreshold, photoUri, updatedAt, deletedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, dosageValue=excluded.dosageValue, dosageUnit=excluded.dosageUnit,
       scheduleType=excluded.scheduleType, times=excluded.times, intervalHours=excluded.intervalHours,
       startDate=excluded.startDate, endDate=excluded.endDate, active=excluded.active, notes=excluded.notes,
       critical=excluded.critical, totalQuantity=excluded.totalQuantity, remainingQuantity=excluded.remainingQuantity,
       refillThreshold=excluded.refillThreshold, photoUri=excluded.photoUri,
       updatedAt=excluded.updatedAt, deletedAt=excluded.deletedAt
     WHERE excluded.updatedAt > medications.updatedAt`,
    med.id, med.petId, med.name, med.dosageValue, med.dosageUnit, med.scheduleType, JSON.stringify(med.times),
    med.intervalHours, med.startDate, med.endDate, med.active ? 1 : 0, med.notes,
    med.critical ? 1 : 0, med.totalQuantity, med.remainingQuantity, med.refillThreshold, med.photoUri,
    med.updatedAt, med.deletedAt
  );
}

// --- Dose logs ---

export async function logDose(input: Omit<DoseLog, "id" | "updatedAt" | "deletedAt" | "loggedByUserId" | "loggedByLabel">): Promise<DoseLog> {
  const d = await getDb();
  const log: DoseLog = { ...input, id: uuid(), updatedAt: now(), deletedAt: null, loggedByUserId: null, loggedByLabel: null };
  await d.runAsync(
    "INSERT INTO dose_logs (id, medicationId, scheduledAt, takenAt, status, amountTaken, note, updatedAt, deletedAt) VALUES (?,?,?,?,?,?,?,?,?)",
    log.id, log.medicationId, log.scheduledAt, log.takenAt, log.status, log.amountTaken, log.note, log.updatedAt, log.deletedAt
  );
  return log;
}

/**
 * Marks a dose taken/skipped/etc. locally. loggedByUserId/loggedByLabel are
 * NOT set here — this device doesn't reliably know "who's holding the
 * phone" vs. "whose account it's signed into" for a shared household, so
 * attribution is stamped server-side from the auth token on push (see
 * server/src/routes/sync.ts) and comes back down on the next pull. Until
 * then a dose this device just logged simply shows no "given by" label.
 */
export async function upsertDoseStatus(
  medicationId: string,
  scheduledAt: string,
  status: DoseStatus,
  amountTaken?: number
): Promise<void> {
  const d = await getDb();
  const existing = await d.getFirstAsync<DoseLog>(
    "SELECT * FROM dose_logs WHERE medicationId = ? AND scheduledAt = ?", medicationId, scheduledAt
  );
  const takenAt = status === "taken" || status === "partial" ? now() : null;
  if (existing) {
    await d.runAsync(
      "UPDATE dose_logs SET status = ?, takenAt = ?, amountTaken = ?, updatedAt = ? WHERE id = ?",
      status, takenAt, amountTaken ?? null, now(), existing.id
    );
  } else {
    await logDose({ medicationId, scheduledAt, takenAt, status, amountTaken: amountTaken ?? null, note: null });
  }
}

export async function upsertDoseLogFromServer(log: DoseLog): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    `INSERT INTO dose_logs (id, medicationId, scheduledAt, takenAt, status, amountTaken, note, loggedByUserId, loggedByLabel, updatedAt, deletedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       takenAt=excluded.takenAt, status=excluded.status, amountTaken=excluded.amountTaken, note=excluded.note,
       loggedByUserId=excluded.loggedByUserId, loggedByLabel=excluded.loggedByLabel,
       updatedAt=excluded.updatedAt, deletedAt=excluded.deletedAt
     WHERE excluded.updatedAt > dose_logs.updatedAt`,
    log.id, log.medicationId, log.scheduledAt, log.takenAt, log.status, log.amountTaken, log.note,
    log.loggedByUserId, log.loggedByLabel, log.updatedAt, log.deletedAt
  );
}

/** Raw dose_logs in a range, keyed for quick lookup by "medicationId|scheduledAt". */
export async function logsInRange(fromIso: string, toIso: string): Promise<Map<string, DoseLog>> {
  const d = await getDb();
  const rows = await d.getAllAsync<DoseLog>(
    "SELECT * FROM dose_logs WHERE scheduledAt BETWEEN ? AND ? AND deletedAt IS NULL", fromIso, toIso
  );
  return new Map(rows.map((r) => [`${r.medicationId}|${r.scheduledAt}`, r]));
}

export async function historyForPet(petId: string, fromIso: string, toIso: string) {
  const d = await getDb();
  return d.getAllAsync<DoseLog & { medicationName: string }>(
    `SELECT dl.*, m.name as medicationName
     FROM dose_logs dl JOIN medications m ON m.id = dl.medicationId
     WHERE m.petId = ? AND dl.scheduledAt BETWEEN ? AND ? AND dl.deletedAt IS NULL
     ORDER BY dl.scheduledAt DESC`,
    petId, fromIso, toIso
  );
}

// --- Soft deletes ---
// Sets deletedAt + bumps updatedAt so the tombstone propagates via sync
// (see upsert*FromServer above, and README §1 "half-implemented"). Cascades
// to children manually since child rows aren't covered by SQLite's
// ON DELETE CASCADE here — this never runs a real DELETE.

export async function deletePet(id: string): Promise<void> {
  const d = await getDb();
  const ts = now();
  await d.runAsync(
    `UPDATE dose_logs SET deletedAt = ?, updatedAt = ?
     WHERE medicationId IN (SELECT id FROM medications WHERE petId = ?)`,
    ts, ts, id
  );
  await d.runAsync("UPDATE medications SET deletedAt = ?, updatedAt = ? WHERE petId = ?", ts, ts, id);
  await d.runAsync("UPDATE pets SET deletedAt = ?, updatedAt = ? WHERE id = ?", ts, ts, id);
}

export async function deleteMedication(id: string): Promise<void> {
  const d = await getDb();
  const ts = now();
  await d.runAsync("UPDATE dose_logs SET deletedAt = ?, updatedAt = ? WHERE medicationId = ?", ts, ts, id);
  await d.runAsync("UPDATE medications SET deletedAt = ?, updatedAt = ? WHERE id = ?", ts, ts, id);
}

// --- Health logs (side effects, mood, weight, stool) ---

export async function createHealthLog(input: Omit<HealthLog, "id" | "updatedAt" | "deletedAt" | "loggedByUserId" | "loggedByLabel">): Promise<HealthLog> {
  const d = await getDb();
  const log: HealthLog = { ...input, id: uuid(), updatedAt: now(), deletedAt: null, loggedByUserId: null, loggedByLabel: null };
  await d.runAsync(
    "INSERT INTO health_logs (id, petId, type, value, note, occurredAt, updatedAt, deletedAt) VALUES (?,?,?,?,?,?,?,?)",
    log.id, log.petId, log.type, log.value, log.note, log.occurredAt, log.updatedAt, log.deletedAt
  );
  return log;
}

export async function listHealthLogs(petId: string, fromIso: string, toIso: string): Promise<HealthLog[]> {
  const d = await getDb();
  return d.getAllAsync<HealthLog>(
    "SELECT * FROM health_logs WHERE petId = ? AND occurredAt BETWEEN ? AND ? AND deletedAt IS NULL ORDER BY occurredAt DESC",
    petId, fromIso, toIso
  );
}

export async function deleteHealthLog(id: string): Promise<void> {
  const d = await getDb();
  const ts = now();
  await d.runAsync("UPDATE health_logs SET deletedAt = ?, updatedAt = ? WHERE id = ?", ts, ts, id);
}

export async function upsertHealthLogFromServer(log: HealthLog): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    `INSERT INTO health_logs (id, petId, type, value, note, occurredAt, loggedByUserId, loggedByLabel, updatedAt, deletedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       type=excluded.type, value=excluded.value, note=excluded.note, occurredAt=excluded.occurredAt,
       loggedByUserId=excluded.loggedByUserId, loggedByLabel=excluded.loggedByLabel,
       updatedAt=excluded.updatedAt, deletedAt=excluded.deletedAt
     WHERE excluded.updatedAt > health_logs.updatedAt`,
    log.id, log.petId, log.type, log.value, log.note, log.occurredAt, log.loggedByUserId, log.loggedByLabel, log.updatedAt, log.deletedAt
  );
}

export async function changedHealthLogsSince(sinceIso: string): Promise<HealthLog[]> {
  const d = await getDb();
  return d.getAllAsync<HealthLog>("SELECT * FROM health_logs WHERE updatedAt > ?", sinceIso);
}

// --- Sync support: rows changed locally since a cursor, for pushing ---

export async function changedPetsSince(sinceIso: string): Promise<Pet[]> {
  const d = await getDb();
  return d.getAllAsync<Pet>("SELECT * FROM pets WHERE updatedAt > ?", sinceIso);
}
export async function changedMedicationsSince(sinceIso: string): Promise<Medication[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>("SELECT * FROM medications WHERE updatedAt > ?", sinceIso);
  return rows.map(rowToMedication);
}
export async function changedDoseLogsSince(sinceIso: string): Promise<DoseLog[]> {
  const d = await getDb();
  return d.getAllAsync<DoseLog>("SELECT * FROM dose_logs WHERE updatedAt > ?", sinceIso);
}

export async function getLastPulledAt(): Promise<string> {
  const d = await getDb();
  const row = await d.getFirstAsync<{ lastPulledAt: string }>("SELECT lastPulledAt FROM sync_meta WHERE id = 0");
  return row?.lastPulledAt ?? "1970-01-01T00:00:00.000Z";
}
export async function setLastPulledAt(iso: string): Promise<void> {
  const d = await getDb();
  await d.runAsync("UPDATE sync_meta SET lastPulledAt = ? WHERE id = 0", iso);
}
export async function getLastPushedAt(): Promise<string> {
  const d = await getDb();
  const row = await d.getFirstAsync<{ lastPushedAt: string }>("SELECT lastPushedAt FROM sync_meta WHERE id = 0");
  return row?.lastPushedAt ?? "1970-01-01T00:00:00.000Z";
}
export async function setLastPushedAt(iso: string): Promise<void> {
  const d = await getDb();
  await d.runAsync("UPDATE sync_meta SET lastPushedAt = ? WHERE id = 0", iso);
}

/**
 * Forces the next pull to fetch everything from scratch. Needed once,
 * right after accepting a household invite: the newly-visible pet (and its
 * medications/dose_logs/health_logs) may have an updatedAt far older than
 * this device's cursor, so a normal incremental pull would miss it — see
 * src/lib/household.ts.
 */
export async function resetSyncCursor(): Promise<void> {
  const d = await getDb();
  await d.runAsync("UPDATE sync_meta SET lastPulledAt = '1970-01-01T00:00:00.000Z' WHERE id = 0");
}
