export type DosageUnit = "tablet" | "ml" | "drop" | "puff" | "unit";
export type ScheduleType = "fixed_times" | "interval" | "as_needed";
export type DoseStatus = "taken" | "skipped" | "partial" | "missed";

// updatedAt/deletedAt exist on every synced row purely for the sync engine
// (see src/lib/sync.ts) — last-write-wins conflict resolution and tombstone
// deletion. Screens never need to read or set them directly; schema.ts
// stamps updatedAt on every write.
export interface Synced {
  updatedAt: string;
  deletedAt: string | null;
}

export interface Pet extends Synced {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  weightKg: number | null;
  photoUri: string | null;
  notes: string | null;
  /** Vet's email, used as the default recipient for "Email to vet" (see src/lib/export.ts). */
  vetEmail: string | null;
  createdAt: string;
}

export interface Medication extends Synced {
  id: string;
  petId: string;
  name: string;
  dosageValue: number;
  dosageUnit: DosageUnit;
  scheduleType: ScheduleType;
  /** "HH:mm" times for fixed_times, or empty for the other types */
  times: string[];
  intervalHours: number | null;
  startDate: string; // ISO date
  endDate: string | null; // ISO date, null = ongoing
  active: boolean;
  notes: string | null;
  /** A missed dose escalates (repeating, louder reminders) instead of just sitting as "missed" — see src/lib/notifications.ts. */
  critical: boolean;
  /** Pill count / liquid volume on hand, in dosageUnit. Decremented by dosageValue (or amountTaken) each time a dose is logged taken/partial — see recordDoseAndDecrement in db/schema.ts. */
  totalQuantity: number | null;
  remainingQuantity: number | null;
  /** Refill alert fires once remainingQuantity drops to/below this. */
  refillThreshold: number | null;
  /** Prescription label photo, same "r2:<key>" convention as Pet.photoUri (see src/lib/photos.ts). */
  photoUri: string | null;
}

export interface DoseLog extends Synced {
  id: string;
  medicationId: string;
  scheduledAt: string; // ISO datetime
  takenAt: string | null;
  status: DoseStatus;
  amountTaken: number | null;
  note: string | null;
  /** Who actually tapped "Give"/"Skip" — distinct from the pet's owner for a shared household. Set by the server on push (see server/src/routes/sync.ts); null until the first sync round-trip. */
  loggedByUserId: string | null;
  loggedByLabel: string | null;
}

export type HealthLogType = "side_effect" | "mood" | "weight" | "stool";

export interface HealthLog extends Synced {
  id: string;
  petId: string;
  type: HealthLogType;
  /** Freeform per type: a number-as-string for weight, a short label for mood/stool, a description for side_effect. */
  value: string;
  note: string | null;
  occurredAt: string; // ISO datetime
  loggedByUserId: string | null;
  loggedByLabel: string | null;
}

export interface PetShareMember {
  id: string;
  invitedEmail: string;
  role: "caregiver";
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
  acceptedAt: string | null;
}

export interface SharedPet {
  petId: string;
  petName: string;
  ownerName: string;
}
