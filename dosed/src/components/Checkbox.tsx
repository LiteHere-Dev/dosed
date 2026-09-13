import { Pressable, Text, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { color, font, space, radius } from "@/theme/tokens";

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!checked)} style={styles.row} hitSlop={6}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked && <Feather name="check" size={13} color={color.paper} />}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  box: {
    width: 20, height: 20, borderRadius: radius.sm - 2,
    borderWidth: 1.5, borderColor: color.hairline,
    alignItems: "center", justifyContent: "center",
  },
  boxChecked: { backgroundColor: color.clay, borderColor: color.clay },
  label: { fontFamily: font.body, fontSize: 14, color: color.ink },
});
