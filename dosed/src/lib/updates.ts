import * as Updates from "expo-updates";

/**
 * Checks for and applies a pending OTA update, then reloads once if one was
 * found. Call this once at launch, fire-and-forget — it's a no-op in dev
 * (Updates.isEnabled is false under expo start) and swallows errors so a
 * flaky network check never blocks app startup.
 */
export async function applyPendingUpdate(): Promise<void> {
  if (!Updates.isEnabled) return; // dev client / expo start
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync(); // applies immediately — acceptable at cold launch, before the user's done anything with the current session
  } catch {
    // Offline, or EAS Update unreachable — the app already launched fine
    // from the embedded/previous bundle, so this is silent by design.
  }
}
