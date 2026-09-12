import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { color, font, radius, space, motion } from "@/theme/tokens";
import type { DoseStatus } from "@/db/types";

interface Props {
  medName: string;
  dosageLabel: string;
  time: string;
  status: DoseStatus | "upcoming";
  onMarkTaken: () => void;
  onMarkSkipped: () => void;
}

// The one high-frequency interactive moment in the app: confirming a dose.
// A spring on the checkmark is justified here (it's tapped many times a
// day, per-pet, per-med) — everywhere else in the app uses plain
// timing curves, per the "reserve springs" rule.
export function DoseRow({ medName, dosageLabel, time, status, onMarkTaken, onMarkSkipped }: Props) {
  const isDone = status === "taken" || status === "partial";
  const checkScale = useSharedValue(isDone ? 1 : 0);
  const rowOpacity = useSharedValue(1);

  const handleTaken = () => {
    checkScale.value = withSpring(1, motion.spring);
    rowOpacity.value = withTiming(0.55, { duration: motion.durationEnter, easing: motion.easeOut });
    onMarkTaken();
  };

  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: rowOpacity.value }));

  return (
    <Animated.View style={[styles.row, fadeStyle]}>
      <View style={styles.info}>
        <Text style={styles.time}>{time}</Text>
        <Text style={styles.name}>{medName}</Text>
        <Text style={styles.dosage}>{dosageLabel}</Text>
      </View>
      {status === "skipped" || status === "missed" ? (
        <Text style={styles.skippedLabel}>{status}</Text>
      ) : isDone ? (
        <Animated.View style={[styles.checkBadge, checkStyle]}>
          <Text style={styles.checkMark}>✓</Text>
        </Animated.View>
      ) : (
        <View style={styles.actions}>
          <Pressable onPress={onMarkSkipped} hitSlop={8}>
            <Text style={styles.skipAction}>Skip</Text>
          </Pressable>
          <Pressable onPress={handleTaken} style={styles.takeButton} hitSlop={8}>
            <Text style={styles.takeLabel}>Give</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  info: { flex: 1 },
  time: { fontFamily: font.body, fontSize: 13, color: color.clayDeep, fontWeight: "700", marginBottom: 2 },
  name: { fontFamily: font.heading, fontSize: 17, color: color.ink },
  dosage: { fontFamily: font.body, fontSize: 13, color: color.inkFaint, marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: space.md },
  skipAction: { fontFamily: font.body, fontSize: 13, color: color.inkFaint },
  takeButton: { backgroundColor: color.clay, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.sm },
  takeLabel: { fontFamily: font.body, fontSize: 13, fontWeight: "700", color: color.paper },
  checkBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: color.mossFaint, alignItems: "center", justifyContent: "center" },
  checkMark: { color: color.moss, fontSize: 15, fontWeight: "700" },
  skippedLabel: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, textTransform: "capitalize" },
});
