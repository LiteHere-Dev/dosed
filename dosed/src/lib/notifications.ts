import * as Notifications from "expo-notifications";
import type { Medication, Pet } from "@/db/types";
import { expandSchedule } from "./schedule";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Schedules local notifications for a medication's doses over the next
 * `daysAhead` days. Call again after any edit — it clears and re-creates
 * this medication's own notifications rather than trying to diff them.
 */
export async function rescheduleForMedication(med: Medication, pet: Pet, daysAhead = 14) {
  await cancelForMedication(med.id);
  if (!(await ensurePermission())) return;

  const now = new Date();
  const horizon = new Date(now.getTime() + daysAhead * 86_400_000);
  const doses = expandSchedule(med, now, horizon);

  for (const dose of doses) {
    const fireDate = new Date(dose.scheduledAt);
    if (fireDate <= now) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `${med.id}:${dose.scheduledAt}`,
      content: {
        title: `${pet.name}'s ${med.name}`,
        body: `${med.dosageValue} ${med.dosageUnit} due now`,
        data: { medicationId: med.id, scheduledAt: dose.scheduledAt },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
    });
  }
}

export async function cancelForMedication(medicationId: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const mine = scheduled.filter((n) => n.identifier.startsWith(`${medicationId}:`));
  await Promise.all(mine.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}
