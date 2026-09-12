import { ScrollView, View, Text, StyleSheet } from "react-native";
import { color, font, space } from "@/theme/tokens";

export type LegalBlock =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "p"; text: string }
  | { type: "li"; text: string };

interface Props {
  updated: string;
  blocks: LegalBlock[];
}

// Shared renderer for the Privacy Policy and Terms & Conditions screens so
// both stay visually consistent with the rest of the app (paper background,
// same heading/body fonts) instead of looking like a pasted-in web page.
export function LegalDoc({ updated, blocks }: Props) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.paper }} contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
      <Text style={styles.updated}>Last updated: {updated}</Text>
      {blocks.map((b, i) => {
        if (b.type === "h1") return <Text key={i} style={styles.h1}>{b.text}</Text>;
        if (b.type === "h2") return <Text key={i} style={styles.h2}>{b.text}</Text>;
        if (b.type === "li") return (
          <View key={i} style={styles.liRow}>
            <Text style={styles.bullet}>{"\u2022"}</Text>
            <Text style={styles.p}>{b.text}</Text>
          </View>
        );
        return <Text key={i} style={styles.p}>{b.text}</Text>;
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  updated: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, marginBottom: space.lg },
  h1: { fontFamily: font.heading, fontSize: 22, color: color.ink, marginTop: space.md, marginBottom: space.sm },
  h2: { fontFamily: font.heading, fontSize: 17, color: color.ink, marginTop: space.lg, marginBottom: space.xs },
  p: { fontFamily: font.body, fontSize: 14, lineHeight: 21, color: color.ink, marginBottom: space.sm, flexShrink: 1 },
  liRow: { flexDirection: "row", marginBottom: space.xs, paddingLeft: space.xs },
  bullet: { fontFamily: font.body, fontSize: 14, color: color.clayDeep, marginRight: space.sm, lineHeight: 21 },
});
