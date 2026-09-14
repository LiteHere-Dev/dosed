import * as Updates from "expo-updates";
import { Alert } from "react-native";

/**
 * True if there's an OTA update on the server this session hasn't loaded
 * yet. No-op (false) in dev, where Updates.isEnabled is false under
 * `expo start`. Swallows network errors as "nothing to offer" rather than
 * surfacing a check failure to the person — an unreachable update server
 * shouldn't look like an app problem.
 */
export async function checkForUpdate(): Promise<boolean> {
  // TEMP DEBUG BUILD — remove this Alert block once the update pipeline
  // is confirmed working. It surfaces the raw result/error on-screen
  // since logcat digging wasn't turning up anything conclusive.
  const debugInfo = {
    isEnabled: Updates.isEnabled,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
    createdAt: Updates.createdAt,
  };

  if (!Updates.isEnabled) {
    Alert.alert("Update check (debug)", "Updates.isEnabled is FALSE — the app isn't even trying to check.\n\n" + JSON.stringify(debugInfo, null, 2));
    return false;
  }
  try {
    const check = await Updates.checkForUpdateAsync();
    Alert.alert(
      "Update check (debug)",
      "isAvailable: " + check.isAvailable + "\nreason: " + (check as any).reason + "\n\n" + JSON.stringify(debugInfo, null, 2)
    );
    return check.isAvailable;
  } catch (err: any) {
    Alert.alert("Update check (debug) — ERROR", String(err?.message ?? err) + "\n\n" + JSON.stringify(debugInfo, null, 2));
    return false;
  }
}

/**
 * Downloads the pending update and reloads immediately. Only called from
 * the update banner once the person taps "Update" — reloading without
 * asking (the old behavior, silently at cold launch) can drop whatever
 * they were mid-way through on the previous screen.
 */
export async function applyUpdate(): Promise<void> {
  await Updates.fetchUpdateAsync();
  await Updates.reloadAsync();
}
