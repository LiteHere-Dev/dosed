import * as Updates from "expo-updates";

/**
 * True if there's an OTA update on the server this session hasn't loaded
 * yet. No-op (false) in dev, where Updates.isEnabled is false under
 * `expo start`. Swallows network errors as "nothing to offer" rather than
 * surfacing a check failure to the person — an unreachable update server
 * shouldn't look like an app problem.
 */
export async function checkForUpdate(): Promise<boolean> {
  if (!Updates.isEnabled) return false;
  try {
    const check = await Updates.checkForUpdateAsync();
    return check.isAvailable;
  } catch {
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
