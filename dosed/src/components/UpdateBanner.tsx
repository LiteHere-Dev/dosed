import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, AppState } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { checkForUpdate, applyUpdate } from "@/lib/updates";
import { color, font, space, motion } from "@/theme/tokens";

type Status = "hidden" | "available" | "updating" | "error";

/**
 * A dismissible top banner offering an OTA update, replacing the old
 * behavior of silently fetching-and-reloading at cold launch: reloading
 * without asking can drop someone mid-task (typing a note, picking a
 * photo). Checks once at launch and again whenever the app returns to the
 * foreground; the person decides when to take the reload.
 */
export function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Status>("hidden");
  const [dismissed, setDismissed] = useState(false);
  const reveal = useSharedValue(0);

  const check = async (skipIfDismissed: boolean) => {
    if (skipIfDismissed && dismissed) return;
    const available = await checkForUpdate();
    setStatus((prev) => (available ? "available" : prev === "updating" ? prev : "hidden"));
  };

  useEffect(() => {
    check(false);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") check(true); });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reveal.value = withTiming(status === "available" || status === "updating" || status === "error" ? 1 : 0, {
      duration: motion.durationEnter,
      easing: motion.easeOut,
    });
  }, [status]);

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * -16 }],
  }));

  if (status === "hidden") return null;

  const onUpdate = async () => {
    setStatus("updating");
    try {
      await applyUpdate(); // reloads the app on success; nothing after this line runs
    } catch {
      setStatus("error");
    }
  };

  return (
    <Animated.View style={[styles.wrap, { paddingTop: insets.top + space.xs }, wrapStyle]}>
      <View style={styles.row}>
        <Text style={styles.text} numberOfLines={1}>
          {status === "updating"
            ? "Updating…"
            : status === "error"
            ? "Update failed — try again"
            : "A new version of Dosed is ready"}
        </Text>
        <View style={styles.actions}>
          <Pressable onPress={onUpdate} disabled={status === "updating"} hitSlop={8} style={styles.updateButton}>
            <Text style={styles.updateLabel}>{status === "updating" ? "…" : "Update"}</Text>
          </Pressable>
          <Pressable onPress={() => { setDismissed(true); setStatus("hidden"); }} hitSlop={8} style={styles.dismiss}>
            <Feather name="x" size={16} color={color.paper} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 50,
    backgroundColor: color.clayDeep, paddingBottom: space.sm, paddingHorizontal: space.lg,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  text: { flex: 1, fontFamily: font.body, fontSize: 13, color: color.paper },
  actions: { flexDirection: "row", alignItems: "center", gap: space.sm },
  updateButton: { backgroundColor: color.paper, paddingVertical: 6, paddingHorizontal: space.md, borderRadius: 999 },
  updateLabel: { fontFamily: font.body, fontSize: 12, fontWeight: "700", color: color.clayDeep },
  dismiss: { padding: 4 },
});
