import { ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";
import { color, font, space } from "@/theme/tokens";

export function EmptyState({ title, body, art }: { title: string; body: string; art?: ReactNode }) {
  return (
    <View style={styles.wrap}>
      {art && <View style={styles.art}>{art}</View>}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: space.xxl, paddingHorizontal: space.lg, alignItems: "center" },
  art: { marginBottom: space.lg },
  title: { fontFamily: font.heading, fontSize: 18, color: color.ink, marginBottom: space.xs },
  body: { fontFamily: font.body, fontSize: 14, color: color.inkFaint, textAlign: "center" },
});
