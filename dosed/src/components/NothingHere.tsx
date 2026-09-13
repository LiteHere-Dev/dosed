import { View, Text, StyleSheet } from "react-native";
import { PixelSloth } from "./PixelArt";
import { color, font, space } from "@/theme/tokens";

/**
 * For a section of the app that's deliberately empty (a feature not built
 * yet, a filtered view with no results) — distinct from EmptyState, which
 * is for "you haven't added your first X yet" and always pairs with a call
 * to action. This one has no button: there's nothing to do here, on purpose.
 */
export function NothingHere({ subtitle }: { subtitle?: string }) {
  return (
    <View style={styles.wrap}>
      <PixelSloth pixelSize={9} />
      <Text style={styles.title}>Nothing to see here</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, backgroundColor: color.paper },
  title: { fontFamily: font.heading, fontSize: 20, color: color.ink, marginTop: space.lg },
  subtitle: { fontFamily: font.body, fontSize: 14, color: color.inkFaint, marginTop: space.xs, textAlign: "center" },
});
