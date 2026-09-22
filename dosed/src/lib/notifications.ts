import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
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

// A dose reminder carries two actions so the person can act straight from
// the lock screen/notification shade without opening the app — see the
// response listener wired up in registerNotificationResponseHandler below
// (called once from app/_layout.tsx). Actions never open the app to the
// foreground: the whole point is "handle it without unlocking to a screen".
export const DOSE_CATEGORY = "dose-reminder";
const MARK_GIVEN_ACTION = "MARK_GIVEN";
const SNOOZE_ACTION = "SNOOZE_15";

let categoriesReady = false;
async function ensureCategories() {
  if (categoriesReady) return;
  await Notifications.setNotificationCategoryAsync(DOSE_CATEGORY, [
    { identifier: MARK_GIVEN_ACTION, buttonTitle: "Mark as Given", options: { opensAppToForeground: false } },
    { identifier: SNOOZE_ACTION, buttonTitle: "Snooze 15m", options: { opensAppToForeground: false } },
  ]);
  categoriesReady = true;
}

export async function ensurePermission(): Promise<boolean> {
  await ensureCategories();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

const identifierFor = (medicationId: string, scheduledAt: string, suffix?: string) =>
  `${medicationId}:${scheduledAt}${suffix ? `:${suffix}` : ""}`;

// Minutes after the scheduled time a *critical* dose (insulin, seizure
// meds, etc — see Medication.critical) keeps re-alerting if it's never
// marked given. There's no reliable background task to check "is this
// still outstanding" on a phone, so instead every escalation step is
// scheduled up front; marking the dose given/skipped cancels whichever of
// these haven't fired yet (see cancelForDose below).
const ESCALATION_MINUTES = [5, 10, 15, 20];

async function scheduleOne(medicationId: string, scheduledAt: string, fireDate: Date, title: string, body: string, critical: boolean, suffix?: string) {
  await Notifications.scheduleNotificationAsync({
    identifier: identifierFor(medicationId, scheduledAt, suffix),
    content: {
      title,
      body,
      data: { medicationId, scheduledAt },
      categoryIdentifier: DOSE_CATEGORY,
      sound: critical ? "default" : undefined,
      ...(Platform.OS === "ios" ? { interruptionLevel: critical ? "timeSensitive" : "active" } : {}),
      ...(Platform.OS === "android" ? { priority: critical ? Notifications.AndroidNotificationPriority.MAX : Notifications.AndroidNotificationPriority.DEFAULT } : {}),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
  });
}

/**
 * Schedules local notifications for a medication's doses over the next
 * `daysAhead` days. Call again after any edit — it clears and re-creates
 * this medication's own notifications rather than trying to diff them.
 * Critical medications also get a series of escalating re-reminders per dose
 * (see ESCALATION_MINUTES) so a missed insulin/seizure dose doesn't just
 * sit as one easy-to-miss alert.
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
    const title = `${pet.name}'s ${med.name}`;
    const body = `${med.dosageValue} ${med.dosageUnit} due now`;
    await scheduleOne(med.id, dose.scheduledAt, fireDate, title, body, med.critical);

    if (med.critical) {
      for (const minutes of ESCALATION_MINUTES) {
        const escFireDate = new Date(fireDate.getTime() + minutes * 60_000);
        await scheduleOne(
          med.id, dose.scheduledAt, escFireDate,
          `⚠️ Still due: ${pet.name}'s ${med.name}`,
          `${minutes} minutes late — ${med.dosageValue} ${med.dosageUnit} hasn't been marked given.`,
          true, `esc${minutes}`
        );
      }
    }
  }
}

export async function cancelForMedication(medicationId: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const mine = scheduled.filter((n) => n.identifier.startsWith(`${medicationId}:`));
  await Promise.all(mine.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

/** Cancels the main reminder and any pending escalations for one specific dose instance — call this whenever a dose is marked taken/skipped, from the UI or from a notification action. */
export async function cancelForDose(medicationId: string, scheduledAt: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const base = identifierFor(medicationId, scheduledAt);
  const mine = scheduled.filter((n) => n.identifier === base || n.identifier.startsWith(`${base}:`));
  await Promise.all(mine.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

/** Cancels this dose's current reminder(s) and reschedules a single one-off reminder `minutes` from now. */
export async function snoozeDose(med: Medication, pet: Pet, scheduledAt: string, minutes: 15 | 30) {
  await cancelForDose(med.id, scheduledAt);
  if (!(await ensurePermission())) return;
  const fireDate = new Date(Date.now() + minutes * 60_000);
  await scheduleOne(
    med.id, scheduledAt, fireDate,
    `${pet.name}'s ${med.name} (snoozed)`,
    `${med.dosageValue} ${med.dosageUnit} — snoozed ${minutes} min`,
    med.critical, "snooze"
  );
}

export interface NotificationActionHandlers {
  onMarkGiven: (medicationId: string, scheduledAt: string) => Promise<void>;
  onSnooze: (medicationId: string, scheduledAt: string, minutes: 15) => Promise<void>;
}

/**
 * Wires up the interactive notification actions (see DOSE_CATEGORY above)
 * to real app behavior, so tapping "Mark as Given" or "Snooze 15m" on a
 * lock-screen notification works without opening the app. Call once, near
 * app startup (see app/_layout.tsx). Requires a custom dev client / EAS
 * build to see the action buttons on iOS — Expo Go doesn't render custom
 * notification categories.
 */
export function registerNotificationResponseHandler(handlers: NotificationActionHandlers) {
  return Notifications.addNotificationResponseReceivedListener(async (response) => {
    const data = response.notification.request.content.data as { medicationId?: string; scheduledAt?: string } | undefined;
    if (!data?.medicationId || !data.scheduledAt) return;
    if (response.actionIdentifier === MARK_GIVEN_ACTION) {
      await handlers.onMarkGiven(data.medicationId, data.scheduledAt);
    } else if (response.actionIdentifier === SNOOZE_ACTION) {
      await handlers.onSnooze(data.medicationId, data.scheduledAt, 15);
    }
  });
}
