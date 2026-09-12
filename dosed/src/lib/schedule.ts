import type { Medication } from "@/db/types";

export interface DueDose {
  medicationId: string;
  scheduledAt: string; // ISO
}

/**
 * Expands a medication's schedule into concrete dose instances between
 * [fromDate, toDate] (inclusive). "as_needed" medications have no fixed
 * instances — they're logged directly when given, so they're skipped here.
 */
export function expandSchedule(med: Medication, fromDate: Date, toDate: Date): DueDose[] {
  if (!med.active || med.scheduleType === "as_needed") return [];

  const start = maxDate(fromDate, new Date(med.startDate));
  const end = med.endDate ? minDate(toDate, new Date(med.endDate)) : toDate;
  if (start > end) return [];

  const out: DueDose[] = [];

  if (med.scheduleType === "fixed_times") {
    for (let d = startOfDay(start); d <= end; d = addDays(d, 1)) {
      for (const hhmm of med.times) {
        const [h, m] = hhmm.split(":").map(Number);
        const at = new Date(d);
        at.setHours(h, m, 0, 0);
        if (at >= start && at <= end) out.push({ medicationId: med.id, scheduledAt: at.toISOString() });
      }
    }
  } else if (med.scheduleType === "interval" && med.intervalHours) {
    // Anchor on the medication's start date/time, not "now", so the
    // interval stays stable across app restarts and date-range queries.
    const anchor = new Date(med.startDate);
    const stepMs = med.intervalHours * 3600_000;
    let at = new Date(anchor);
    if (at < start) {
      const steps = Math.ceil((start.getTime() - at.getTime()) / stepMs);
      at = new Date(at.getTime() + steps * stepMs);
    }
    for (; at <= end; at = new Date(at.getTime() + stepMs)) {
      out.push({ medicationId: med.id, scheduledAt: at.toISOString() });
    }
  }

  return out.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

const startOfDay = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };
const addDays = (d: Date, n: number) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
const maxDate = (a: Date, b: Date) => (a > b ? a : b);
const minDate = (a: Date, b: Date) => (a < b ? a : b);
