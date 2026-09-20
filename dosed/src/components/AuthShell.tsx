import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet, Pressable, KeyboardAvoidingView, Platform, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, radius, space } from "@/theme/tokens";

// The full intro (brand fades in on a dark screen, then the light sheet
// sweeps up) only plays the first time an auth screen opens per app launch.
// Later visits (login <-> register) skip straight to the short version so
// it never feels like a wall between the person and the form.
let introPlayed = false;

const RevealBase = createContext(0);
const EASE = Easing.bezierFn(0.22, 1, 0.36, 1);

/** Wraps one piece of the form so it fades + rises in, staggered by `index`. */
export function Reveal({ index, children }: { index: number; children: ReactNode }) {
  const base = useContext(RevealBase);
  return (
    <Animated.View entering={FadeInDown.delay(base + index * 80).duration(420).easing(EASE)}>
      {children}
    </Animated.View>
  );
}

interface ShellProps {
  tagline: string;
  children: ReactNode;
  /** When true, fades a dark curtain over the screen (used right before navigating into the app). */
  curtain?: boolean;
}

export function AuthShell({ tagline, children, curtain = false }: ShellProps) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const first = useRef(!introPlayed && !reduced).current;

  // Geometry of the dark "bowl": a circle-cornered box whose bottom edge is a
  // shallow arc, `sag` px deeper in the middle than at the screen edges.
  const headerH = Math.min(250, Math.round(H * 0.3));
  const sag = 64;
  const R = (W * W) / 4 / (2 * sag) + sag / 2;
  const bowlW = R * 2;
  const bowlH = Math.max(H + sag + 20, R + 60);
  const startShift = H - headerH + sag; // pushes the bowl down so it covers the whole screen at p = 0
  const brandTop = insets.top + 30;
  const brandStartShift = H / 2 - brandTop - 24;

  const p = useSharedValue(reduced ? 1 : 0);
  const brandOpacity = useSharedValue(reduced ? 1 : first ? 0 : 1);
  const curtainOpacity = useSharedValue(0);

  useEffect(() => {
    if (reduced) { introPlayed = true; return; }
    if (first) brandOpacity.value = withDelay(150, withTiming(1, { duration: 700 }));
    p.value = withDelay(first ? 1250 : 120, withTiming(1, { duration: first ? 950 : 650, easing: EASE }));
    introPlayed = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    curtainOpacity.value = withTiming(curtain ? 1 : 0, { duration: 340, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curtain]);

  const bowlStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.value) * startShift }] }));
  const brandStyle = useAnimatedStyle(() => ({
    opacity: brandOpacity.value,
    transform: [{ translateY: (1 - p.value) * brandStartShift }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.5, 1], [0, 1], "clamp"),
    transform: [{ translateY: interpolate(p.value, [0.5, 1], [6, 0], "clamp") }],
  }));
  const curtainStyle = useAnimatedStyle(() => ({ opacity: curtainOpacity.value }));

  const revealBase = reduced ? 0 : first ? 1900 : 380;

  return (
    <View style={{ flex: 1, backgroundColor: color.paper, overflow: "hidden" }}>
      <StatusBar style="light" />

      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            width: bowlW,
            height: bowlH,
            left: (W - bowlW) / 2,
            top: headerH - bowlH,
            backgroundColor: color.ink,
            borderBottomLeftRadius: R,
            borderBottomRightRadius: R,
          },
          bowlStyle,
        ]}
      />

      <Animated.View pointerEvents="none" style={[styles.brandBlock, { top: brandTop }, brandStyle]}>
        <Text style={styles.brand}>DOSED</Text>
        <Animated.Text style={[styles.tagline, taglineStyle]}>{tagline}</Animated.Text>
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ position: "absolute", top: headerH, left: 0, right: 0, bottom: 0 }}
      >
        <RevealBase.Provider value={revealBase}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.xxl }}
          >
            {children}
          </ScrollView>
        </RevealBase.Provider>
      </KeyboardAvoidingView>

      <Animated.View pointerEvents={curtain ? "auto" : "none"} style={[StyleSheet.absoluteFill, { backgroundColor: color.ink }, curtainStyle]} />
    </View>
  );
}

/** Labelled input with a focus ring, and a show/hide toggle when `secure`. */
export function AuthField({ label, secure, ...rest }: { label: string; secure?: boolean } & React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
        <TextInput
          {...rest}
          style={styles.input}
          placeholderTextColor={color.inkFaint}
          secureTextEntry={secure ? hidden : false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {secure && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10}>
            <Feather name={hidden ? "eye" : "eye-off"} size={18} color={color.inkFaint} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * Primary button that, while busy, shrinks into a small pill with three
 * pulsing dots — the "it's working" state — and grows back if it fails.
 */
export function MorphButton({ label, busy, onPress, style }: { label: string; busy: boolean; onPress: () => void; style?: object }) {
  const [w, setW] = useState(0);
  const k = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    k.value = withTiming(busy ? 1 : 0, { duration: 300, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const btnStyle = useAnimatedStyle(() => ({
    width: w > 0 ? interpolate(k.value, [0, 1], [w, 128]) : "100%",
    borderRadius: interpolate(k.value, [0, 1], [radius.md, 26]),
    transform: [{ scale: scale.value }],
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: 1 - k.value }));
  const dotsStyle = useAnimatedStyle(() => ({ opacity: k.value }));

  return (
    <View style={[{ alignItems: "center" }, style]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Pressable
        disabled={busy}
        onPress={onPress}
        onPressIn={() => (scale.value = withTiming(0.97, { duration: 90 }))}
        onPressOut={() => (scale.value = withTiming(1, { duration: 180 }))}
      >
        <Animated.View style={[styles.morph, btnStyle]}>
          <Animated.Text style={[styles.morphLabel, labelStyle]} numberOfLines={1}>{label}</Animated.Text>
          <Animated.View style={[styles.dots, dotsStyle]}>
            <Dot delay={0} active={busy} />
            <Dot delay={140} active={busy} />
            <Dot delay={280} active={busy} />
          </Animated.View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

function Dot({ delay, active }: { delay: number; active: boolean }) {
  const s = useSharedValue(0.35);
  useEffect(() => {
    if (active) {
      s.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 320 }), withTiming(0.35, { duration: 320 })), -1, false));
    } else {
      cancelAnimation(s);
      s.value = 0.35;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const st = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: 0.7 + 0.5 * s.value }] }));
  return <Animated.View style={[styles.dot, st]} />;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const styles = StyleSheet.create({
  brandBlock: { position: "absolute", left: space.xl, right: space.xl },
  brand: { fontFamily: font.heading, fontSize: 30, letterSpacing: 9, color: color.paper },
  tagline: { fontFamily: font.body, fontSize: 14, color: "rgba(247,243,236,0.7)", marginTop: space.xs },
  label: { fontFamily: font.body, fontSize: 13, fontWeight: "600", color: color.ink, marginBottom: 6 },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: color.paperRaised, borderRadius: radius.md,
    borderWidth: 1, borderColor: color.hairline, paddingHorizontal: space.md,
  },
  inputWrapFocused: { borderColor: color.ink },
  input: { flex: 1, fontFamily: font.body, fontSize: 16, color: color.ink, paddingVertical: 13 },
  morph: { height: 52, backgroundColor: color.clay, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  morphLabel: { position: "absolute", fontFamily: font.body, fontSize: 16, fontWeight: "700", color: color.paper },
  dots: { position: "absolute", flexDirection: "row", gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.paper },
});
