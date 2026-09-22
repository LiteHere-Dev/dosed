import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Modal } from "react-native";
import { Feather } from "@expo/vector-icons";
import { createHealthLog } from "@/db/schema";
import { runSync } from "@/lib/sync";
import { color, font, space, radius } from "@/theme/tokens";
import type { HealthLogType } from "@/db/types";

const TYPES: { type: HealthLogType; label: string; icon: keyof typeof Feather.glyphMap; chips?: string[]; placeholder: string; keyboardType?: "default" | "decimal-pad" }[] = [
  { type: "side_effect", label: "Side effect", icon: "alert-circle", placeholder: "e.g. vomiting, drowsiness", keyboardType: "default" },
  { type: "mood", label: "Mood", icon: "smile", chips: ["Normal", "Lethargic", "Anxious", "Playful"], placeholder: "Describe their mood" },
  { type: "weight", label: "Weight", icon: "bar-chart-2", placeholder: "kg", keyboardType: "decimal-pad" },
  { type: "stool", label: "Stool", icon: "activity", chips: ["Normal", "Soft", "Diarrhea", "Hard"], placeholder: "Describe consistency" },
];

/**
 * One-tap logging for the things a vet usually asks about between visits —
 * side effects, mood changes, weight, and stool consistency — alongside
 * the medication schedule. See export.ts, which folds these into the vet
 * visit summary.
 */
export function QuickLogButtons({ petId, onLogged }: { petId: string; onLogged?: () => void }) {
  const [active, setActive] = useState<(typeof TYPES)[number] | null>(null);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const close = () => { setActive(null); setValue(""); setNote(""); };

  const save = async () => {
    if (!active || !value.trim() || saving) return;
    setSaving(true);
    try {
      await createHealthLog({ petId, type: active.type, value: value.trim(), note: note.trim() || null, occurredAt: new Date().toISOString() });
      close();
      onLogged?.();
      runSync().catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <View style={styles.row}>
        {TYPES.map((t) => (
          <Pressable key={t.type} style={styles.button} onPress={() => setActive(t)}>
            <Feather name={t.icon} size={16} color={color.clayDeep} />
            <Text style={styles.buttonLabel}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Modal visible={!!active} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>Log {active?.label.toLowerCase()}</Text>
            {active?.chips ? (
              <View style={styles.chipRow}>
                {active.chips.map((c) => (
                  <Pressable key={c} style={[styles.chip, value === c && styles.chipActive]} onPress={() => setValue(c)}>
                    <Text style={[styles.chipLabel, value === c && styles.chipLabelActive]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={setValue}
                placeholder={active?.placeholder}
                placeholderTextColor={color.inkFaint}
                keyboardType={active?.keyboardType ?? "default"}
                autoFocus
              />
            )}
            <TextInput
              style={[styles.input, { marginTop: space.sm }]}
              value={note}
              onChangeText={setNote}
              placeholder="Note (optional)"
              placeholderTextColor={color.inkFaint}
            />
            <View style={styles.actionsRow}>
              <Pressable onPress={close} hitSlop={8}><Text style={styles.cancelLabel}>Cancel</Text></Pressable>
              <Pressable onPress={save} hitSlop={8} disabled={!value.trim() || saving}>
                <Text style={[styles.saveLabel, (!value.trim() || saving) && { opacity: 0.5 }]}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  button: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: space.sm, paddingHorizontal: space.md,
    backgroundColor: color.paperRaised, borderRadius: 999, borderWidth: 1, borderColor: color.hairline,
  },
  buttonLabel: { fontFamily: font.body, fontSize: 13, color: color.ink, fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: color.overlay, alignItems: "center", justifyContent: "center", padding: space.xl },
  card: { backgroundColor: color.paper, borderRadius: radius.md, padding: space.lg, width: "100%", maxWidth: 360, borderWidth: 1, borderColor: color.hairline },
  title: { fontFamily: font.heading, fontSize: 17, color: color.ink, marginBottom: space.md },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { paddingVertical: space.xs, paddingHorizontal: space.md, borderRadius: 999, backgroundColor: color.paperRaised, borderWidth: 1, borderColor: color.hairline },
  chipActive: { backgroundColor: color.clay, borderColor: color.clay },
  chipLabel: { fontFamily: font.body, fontSize: 13, color: color.ink },
  chipLabelActive: { color: color.paper, fontWeight: "700" },
  input: {
    fontFamily: font.body, fontSize: 15, color: color.ink, backgroundColor: color.paperRaised,
    borderRadius: radius.sm, borderWidth: 1, borderColor: color.hairline, paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  actionsRow: { flexDirection: "row", justifyContent: "flex-end", gap: space.lg, marginTop: space.lg },
  cancelLabel: { fontFamily: font.body, fontSize: 15, color: color.inkFaint, fontWeight: "600" },
  saveLabel: { fontFamily: font.body, fontSize: 15, color: color.clayDeep, fontWeight: "700" },
});
