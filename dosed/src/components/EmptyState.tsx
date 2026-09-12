import { View, Text, StyleSheet } from "react-native";
import { color, font, space } from "@/theme/tokens";

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: space.xxl, paddingHorizontal: space.lg, alignItems: "center" },
  title: { fontFamily: font.heading, fontSize: 18, color: color.ink, marginBottom: space.xs },
  body: { fontFamily: font.body, fontSize: 14, color: color.inkFaint, textAlign: "center" },
});
