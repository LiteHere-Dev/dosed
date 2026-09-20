import { useEffect, useState } from "react";
import { View, Text, StyleSheet, AppState, ViewStyle } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { PetAvatar } from "@/components/PixelArt";
import { hourIndex, quoteForHour } from "@/lib/quotes";
import { color, font, space } from "@/theme/tokens";

/**
 * A small "quote of the hour" card. The quote is a pure function of the
 * current clock hour, so there's nothing to store or sync — it just needs
 * to notice when the hour changes. A 20-second check (plus a check when the
 * app returns to the foreground) is cheap and keeps it from ever being more
 * than a few seconds late, without one very long timer.
 */
export function PlayfulQuote({ style }: { style?: ViewStyle }) {
  const [hour, setHour] = useState(() => hourIndex());

  useEffect(() => {
    const check = () => setHour(hourIndex()); // same number = no re-render
    const id = setInterval(check, 20000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") check(); });
    return () => { clearInterval(id); sub.remove(); };
  }, []);

  const { index, text } = quoteForHour(hour);

  return (
    // key makes the card re-mount (and fade in) whenever the quote changes
    <Animated.View key={index} entering={FadeIn.duration(600)} style={[styles.card, style]}>
      <PetAvatar name="" species={index % 2 === 0 ? "cat" : "dog"} size={44} />
      <View style={styles.textWrap}>
        <Text style={styles.label}>Quote of the hour</Text>
        <Text style={styles.quote}>{text}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: space.md,
    // No background or border: the quote sits directly on the page.
    paddingVertical: space.md, paddingHorizontal: space.xs, marginBottom: space.md,
  },
  textWrap: { flex: 1 },
  label: {
    fontFamily: font.body, fontSize: 10, fontWeight: "700", letterSpacing: 0.8,
    textTransform: "uppercase", color: color.clay, marginBottom: 2,
  },
  quote: { fontFamily: font.heading, fontSize: 15, lineHeight: 21, color: color.ink },
});
