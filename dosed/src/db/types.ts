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
}

export interface DoseLog extends Synced {
  id: string;
  medicationId: string;
  scheduledAt: string; // ISO datetime
  takenAt: string | null;
  status: DoseStatus;
  amountTaken: number | null;
  note: string | null;
}
