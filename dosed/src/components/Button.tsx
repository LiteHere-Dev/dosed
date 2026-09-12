import { Pressable, Text, StyleSheet, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { color, font, radius, space, motion } from "@/theme/tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props {
  label: string;
  onPress: () => void;
  variant?: "primary" | "quiet" | "danger";
  style?: ViewStyle;
}

// Every pressable in this app scales to 0.97 on press — the one animation
// applied uniformly, because it's cheap, expected, and earns its keep on
// every tap (see Kowalski: press feedback is a "no-brainer" everywhere,
// not a special-case decision per button).
export function Button({ label, onPress, variant = "primary", style }: Props) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => (scale.value = withTiming(0.97, { duration: 90 }))}
      onPressOut={() => (scale.value = withTiming(1, { duration: motion.durationEnter, easing: motion.easeOut }))}
      style={[styles.base, styles[variant], style, animStyle]}
    >
      <Text style={[styles.label, variant === "primary" && styles.labelOnPrimary]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: "center",
  },
  primary: { backgroundColor: color.clay },
  quiet: { backgroundColor: "transparent", borderWidth: 1, borderColor: color.hairline },
  danger: { backgroundColor: color.danger },
  label: { fontFamily: font.body, fontSize: 15, fontWeight: "600", color: color.ink },
  labelOnPrimary: { color: color.paper },
});
