import { useEffect, useState } from "react";
import { View, ActivityIndicator, AppState, Pressable } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Feather } from "@expo/vector-icons";
import { getDb } from "@/db/schema";
import { isSignedIn } from "@/lib/api";
import { runSync } from "@/lib/sync";
import { hasOnboarded } from "@/lib/onboarding";
import { AppMenu } from "@/components/AppMenu";
import { UpdateBanner } from "@/components/UpdateBanner";
import { color, font } from "@/theme/tokens";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    (async () => {
      await getDb();
      const signedIn = await isSignedIn();
      setAuthed(signedIn);
      setReady(true);
      if (signedIn) runSync().catch(() => {}); // best-effort: offline launch still works from local data
    })();
  }, []);

  // Redirect based on sign-in state, re-checked on every navigation (not just
  // once at launch) so that logging in or registering actually escapes this
  // effect's own redirect instead of bouncing back to /auth/login. "legal"
  // and "onboarding" screens are public and must stay reachable whether
  // signed in or not: people need to be able to read the Privacy Policy /
  // Terms from the login screen, before ever creating an account.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const signedIn = await isSignedIn();
      setAuthed(signedIn);
      const seg0 = segments[0];
      if (seg0 === "legal") return; // always reachable, signed in or not

      if (!signedIn) {
        const onboarded = await hasOnboarded();
        if (!onboarded && seg0 !== "onboarding") {
          router.replace("/onboarding");
          return;
        }
        if (seg0 !== "auth" && seg0 !== "onboarding") router.replace("/auth/login");
        return;
      }

      if (seg0 === "auth" || seg0 === "onboarding") router.replace("/");
    })();
  }, [ready, segments]);

  // Sync whenever the app comes back to the foreground — covers the common
  // case (another device made changes while this one was backgrounded)
  // without needing a background-fetch task.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") isSignedIn().then((s) => s && runSync().catch(() => {}));
    });
    return () => sub.remove();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.paper }}>
        <ActivityIndicator color={color.clay} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <UpdateBanner />
      <AppMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: color.paper },
          headerTitleStyle: { fontFamily: font.heading },
          headerTintColor: color.ink,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: color.paper },
          headerLeft: () =>
            authed ? (
              <Pressable onPress={() => setMenuOpen(true)} hitSlop={12} style={{ marginRight: 12 }}>
                <Feather name="menu" size={22} color={color.ink} />
              </Pressable>
            ) : null,
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: "Today",
            headerRight: () => (
              <Pressable onPress={() => router.push("/settings")} hitSlop={8}>
                <Feather name="settings" size={20} color={color.clayDeep} />
              </Pressable>
            ),
          }}
        />
        <Stack.Screen name="pets/index" options={{ title: "Pets" }} />
        <Stack.Screen name="pets/new" options={{ title: "Add a pet", presentation: "modal" }} />
        <Stack.Screen name="pets/[id]" options={{ title: "" }} />
        <Stack.Screen name="meds/new" options={{ title: "Add medication", presentation: "modal" }} />
        <Stack.Screen name="meds/[id]" options={{ title: "Medication" }} />
        <Stack.Screen name="history/[petId]" options={{ title: "History" }} />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
        <Stack.Screen name="legal/privacy" options={{ title: "Privacy Policy" }} />
        <Stack.Screen name="legal/terms" options={{ title: "Terms & Conditions" }} />
        <Stack.Screen name="onboarding/index" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/register" options={{ title: "Create account" }} />
        <Stack.Screen name="auth/forgot-password" options={{ title: "Reset password" }} />
        <Stack.Screen name="auth/reset-password" options={{ title: "Reset password" }} />
        <Stack.Screen name="auth/verify-email" options={{ title: "Verify email", headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
