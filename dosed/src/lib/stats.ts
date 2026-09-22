import { listMedications, logsInRange } from "@/db/schema";
import { expandSchedule } from "./schedule";

export interface DayCell {
  date: string; // yyyy-mm-dd
  scheduled: number;
  taken: number;
  isFuture: boolean;
  inMonth: boolean;
}

export interface MonthStats {
  cells: DayCell[]; // one entry per day in the calendar grid (may include days from adjacent months for padding)
  completionPct: number | null; // null if nothing was ever scheduled this month
  streak: number; // consecutive days up to today (or the month's last day) with 100% adherence
}

const toDateKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Builds a month's worth of adherence data for one pet: a calendar grid
 * (padded to full weeks like a normal calendar UI) plus an overall
 * completion percentage and a "consecutive fully-adherent days" streak.
 * Mirrors the logic already used for the 7-day view on the dashboard (see
 * app/index.tsx computeDashboard) but generalized to an arbitrary month.
 */
export async function monthStatsForPet(petId: string, year: number, month0: number /* 0-11 */): Promise<MonthStats> {
  const meds = (await listMedications(petId)).filter((m) => m.active);
  const firstOfMonth = new Date(year, month0, 1);
  const lastOfMonth = new Date(year, month0 + 1, 0);

  // Pad to full weeks (Sunday-start) so the grid renders as a normal calendar.
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(lastOfMonth);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  const logs = await logsInRange(startOfDay(gridStart).toISOString(), endOfDay(gridEnd).toISOString());

  const cells: DayCell[] = [];
  const today = startOfDay(new Date());
  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    const dayStart = startOfDay(d);
    const dayEnd = endOfDay(d);
    let scheduled = 0;
    let taken = 0;
    for (const med of meds) {
      for (const dose of expandSchedule(med, dayStart, dayEnd)) {
        scheduled += 1;
        if (logs.get(`${med.id}|${dose.scheduledAt}`)?.status === "taken") taken += 1;
      }
    }
    cells.push({
      date: toDateKey(dayStart),
      scheduled,
      taken,
      isFuture: dayStart > today,
      inMonth: dayStart.getMonth() === month0,
    });
  }

  const inMonthCells = cells.filter((c) => c.inMonth && !c.isFuture);
  const totalScheduled = inMonthCells.reduce((s, c) => s + c.scheduled, 0);
  const totalTaken = inMonthCells.reduce((s, c) => s + c.taken, 0);
  const completionPct = totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : null;

  let streak = 0;
  const pastCells = cells.filter((c) => !c.isFuture).reverse();
  for (const c of pastCells) {
    if (c.scheduled === 0) continue; // nothing due that day — doesn't help or hurt the streak
    if (c.taken === c.scheduled) { streak += 1; continue; }
    break;
  }

  return { cells, completionPct, streak };
}

const startOfDay = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };
const endOfDay = (d: Date) => { const c = new Date(d); c.setHours(23, 59, 59, 999); return c; };
