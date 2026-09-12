import {
  changedPetsSince, changedMedicationsSince, changedDoseLogsSince,
  getLastPushedAt, setLastPushedAt, getLastPulledAt, setLastPulledAt,
  upsertPetFromServer, upsertMedicationFromServer, upsertDoseLogFromServer,
} from "@/db/schema";
import { pullChanges, pushChanges } from "./api";

let syncing = false;

/**
 * Runs one push-then-pull round trip. Safe to call often — it no-ops if a
 * sync is already in flight, and does nothing destructive if it's offline
 * (a failed fetch just rejects; local data is untouched either way).
 */
export async function runSync(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    await push();
    await pull();
  } finally {
    syncing = false;
  }
}

async function push() {
  const since = await getLastPushedAt();
  const [pets, medications, doseLogs] = await Promise.all([
    changedPetsSince(since), changedMedicationsSince(since), changedDoseLogsSince(since),
  ]);
  if (pets.length === 0 && medications.length === 0 && doseLogs.length === 0) return;
  const { serverTime } = await pushChanges({ pets, medications, doseLogs });
  await setLastPushedAt(serverTime);
}

async function pull() {
  const since = await getLastPulledAt();
  const { serverTime, pets, medications, doseLogs } = await pullChanges(since);
  // Sequential, not Promise.all: medications reference petId and dose_logs
  // reference medicationId via foreign keys, so pets must land first.
  for (const p of pets) await upsertPetFromServer(p);
  for (const m of medications) await upsertMedicationFromServer(m);
  for (const d of doseLogs) await upsertDoseLogFromServer(d);
  await setLastPulledAt(serverTime);
}
