import { View, Text, StyleSheet } from "react-native";
import { Link, Stack } from "expo-router";
import { PixelSloth } from "@/components/PixelArt";
import { color, font, space } from "@/theme/tokens";

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={styles.wrap}>
        <PixelSloth pixelSize={9} />
        <Text style={styles.title}>This page wandered off</Text>
        <Text style={styles.body}>There's nothing here. Let's get you back.</Text>
        <Link href="/" style={styles.link}>
          Back to Today
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, backgroundColor: color.paper },
  title: { fontFamily: font.heading, fontSize: 22, color: color.ink, marginTop: space.lg, textAlign: "center" },
  body: { fontFamily: font.body, fontSize: 14, color: color.inkFaint, marginTop: space.xs, textAlign: "center" },
  link: { fontFamily: font.body, fontSize: 15, color: color.clayDeep, fontWeight: "600", marginTop: space.xl },
});
