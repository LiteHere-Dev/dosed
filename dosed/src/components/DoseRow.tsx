import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { color, font, radius, space, motion } from "@/theme/tokens";
import type { DoseStatus } from "@/db/types";

interface Props {
  medName: string;
  dosageLabel: string;
  time: string;
  status: DoseStatus | "upcoming";
  critical?: boolean;
  /** Who actually gave/skipped this dose, for a shared household — see db/types.ts DoseLog.loggedByLabel. */
  loggedByLabel?: string | null;
  onMarkTaken: () => void;
  onMarkSkipped: () => void;
  /** Omit to hide the snooze control entirely (e.g. for doses that are neither due nor overdue). */
  onSnooze?: (minutes: 15 | 30) => void;
}

// The one high-frequency interactive moment in the app: confirming a dose.
// A spring on the checkmark is justified here (it's tapped many times a
// day, per-pet, per-med) — everywhere else in the app uses plain
// timing curves, per the "reserve springs" rule.
export function DoseRow({ medName, dosageLabel, time, status, critical, loggedByLabel, onMarkTaken, onMarkSkipped, onSnooze }: Props) {
  const isDone = status === "taken" || status === "partial";
  const checkScale = useSharedValue(isDone ? 1 : 0);
  const rowOpacity = useSharedValue(1);
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  const handleTaken = () => {
    checkScale.value = withSpring(1, motion.spring);
    rowOpacity.value = withTiming(0.55, { duration: motion.durationEnter, easing: motion.easeOut });
    onMarkTaken();
  };

  const handleSnooze = (minutes: 15 | 30) => {
    setSnoozeOpen(false);
    onSnooze?.(minutes);
  };

  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: rowOpacity.value }));

  return (
    <Animated.View entering={FadeIn.duration(280)} layout={LinearTransition.duration(220)} style={[styles.row, fadeStyle]}>
      <View style={styles.mainLine}>
        <View style={styles.info}>
          <Text style={styles.time}>{time}</Text>
          <View style={styles.nameLine}>
            <Text style={styles.name}>{medName}</Text>
            {critical ? <Text style={styles.criticalBadge}>critical</Text> : null}
          </View>
          <Text style={styles.dosage}>{dosageLabel}</Text>
          {loggedByLabel ? <Text style={styles.loggedBy}>Given by {loggedByLabel}</Text> : null}
        </View>
        {status === "skipped" || status === "missed" ? (
          <Text style={styles.skippedLabel}>{status}</Text>
        ) : isDone ? (
          <Animated.View style={[styles.checkBadge, checkStyle]}>
            <Text style={styles.checkMark}>✓</Text>
          </Animated.View>
        ) : (
          <View style={styles.actions}>
            {onSnooze ? (
              <Pressable onPress={() => setSnoozeOpen((v) => !v)} hitSlop={8}>
                <Text style={styles.snoozeToggle}>⏰</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onMarkSkipped} hitSlop={8}>
              <Text style={styles.skipAction}>Skip</Text>
            </Pressable>
            <Pressable onPress={handleTaken} style={styles.takeButton} hitSlop={8}>
              <Text style={styles.takeLabel}>Give</Text>
            </Pressable>
          </View>
        )}
      </View>
      {snoozeOpen && onSnooze ? (
        <Animated.View entering={FadeIn.duration(160)} style={styles.snoozeRow}>
          <Text style={styles.snoozeLabel}>Snooze</Text>
          <Pressable onPress={() => handleSnooze(15)} style={styles.snoozeChip}><Text style={styles.snoozeChipLabel}>15m</Text></Pressable>
          <Pressable onPress={() => handleSnooze(30)} style={styles.snoozeChip}><Text style={styles.snoozeChipLabel}>30m</Text></Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  mainLine: { flexDirection: "row", alignItems: "center" },
  info: { flex: 1 },
  time: { fontFamily: font.body, fontSize: 13, color: color.clayDeep, fontWeight: "700", marginBottom: 2 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: { fontFamily: font.heading, fontSize: 17, color: color.ink },
  criticalBadge: {
    fontFamily: font.body, fontSize: 10, fontWeight: "700", textTransform: "uppercase",
    color: color.paper, backgroundColor: color.amber, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm,
  },
  dosage: { fontFamily: font.body, fontSize: 13, color: color.inkFaint, marginTop: 2 },
  loggedBy: { fontFamily: font.body, fontSize: 11, color: color.moss, marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: space.md },
  snoozeToggle: { fontSize: 16 },
  skipAction: { fontFamily: font.body, fontSize: 13, color: color.inkFaint },
  takeButton: { backgroundColor: color.clay, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.sm },
  takeLabel: { fontFamily: font.body, fontSize: 13, fontWeight: "700", color: color.paper },
  checkBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: color.mossFaint, alignItems: "center", justifyContent: "center" },
  checkMark: { color: color.moss, fontSize: 15, fontWeight: "700" },
  skippedLabel: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, textTransform: "capitalize" },
  snoozeRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm, paddingLeft: 2 },
  snoozeLabel: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, marginRight: 4 },
  snoozeChip: { backgroundColor: color.mossFaint, paddingVertical: 4, paddingHorizontal: space.sm, borderRadius: radius.sm },
  snoozeChipLabel: { fontFamily: font.body, fontSize: 12, fontWeight: "700", color: color.clayDeep },
});
