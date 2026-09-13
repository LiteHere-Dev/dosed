import * as SecureStore from "expo-secure-store";

const KEY = "dosed_onboarded";

export async function hasOnboarded(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY)) === "true";
}

export async function markOnboarded(): Promise<void> {
  await SecureStore.setItemAsync(KEY, "true");
}
