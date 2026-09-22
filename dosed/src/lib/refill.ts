import * as Notifications from "expo-notifications";
import type { Medication, Pet } from "@/db/types";
import { sendRefillAlert } from "./api";
import { ensurePermission } from "./notifications";

/**
 * Fires when recordDoseAndDecrement (see db/schema.ts) reports that a
 * medication's remaining quantity just crossed its refill threshold. Shows
 * an on-device notification immediately (works offline) and best-effort
 * emails the pet's owner via the server (see server/src/routes/notify.ts) —
 * the two are independent, so a failed email never blocks the local alert.
 */
export async function raiseRefillAlert(med: Medication, pet: Pet) {
  if (await ensurePermission()) {
    await Notifications.scheduleNotificationAsync({
      identifier: `refill:${med.id}:${Date.now()}`,
      content: {
        title: `${pet.name}'s ${med.name} is running low`,
        body: `About ${med.remainingQuantity} ${med.dosageUnit} left — time to request a refill.`,
      },
      trigger: null, // fire immediately
    });
  }

  try {
    await sendRefillAlert({
      medicationId: med.id,
      medicationName: med.name,
      petName: pet.name,
      remainingQuantity: med.remainingQuantity ?? 0,
      unit: med.dosageUnit,
    });
  } catch {
    // Offline or server unreachable — the local notification above already
    // told the person; the email is a nice-to-have on top of that.
  }
}
