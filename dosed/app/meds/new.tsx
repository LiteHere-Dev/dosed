import { useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createMedication, getPet } from "@/db/schema";
import { rescheduleForMedication } from "@/lib/notifications";
import { runSync } from "@/lib/sync";
import { Button } from "@/components/Button";
import { color, font, space, radius } from "@/theme/tokens";
import type { DosageUnit, ScheduleType } from "@/db/types";

const UNITS: DosageUnit[] = ["tablet", "ml", "drop", "puff", "unit"];
const SCHEDULES: { type: ScheduleType; label: string }[] = [
  { type: "fixed_times", label: "Set times" },
  { type: "interval", label: "Every X hours" },
  { type: "as_needed", label: "As needed" },
];

export default function NewMedication() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const router = useRouter();

  const [name, setName] = useState("");
  const [dosageValue, setDosageValue] = useState("");
  const [dosageUnit, setDosageUnit] = useState<DosageUnit>("tablet");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("fixed_times");
  // Simplest input that works for time-of-day entry: a comma-separated
  // "HH:mm" field, rather than a bundled time-picker dependency or a
  // custom wheel component neither the MVP nor the user asked for.
  const [timesText, setTimesText] = useState("08:00");
  const [intervalHours, setIntervalHours] = useState("8");

  const canSave = name.trim().length > 0 && Number(dosageValue) > 0;

  const save = async () => {
    if (!canSave) return;
    const med = await createMedication({
      petId,
      name: name.trim(),
      dosageValue: Number(dosageValue),
      dosageUnit,
      scheduleType,
      times: scheduleType === "fixed_times" ? timesText.split(",").map((t) => t.trim()).filter(Boolean) : [],
      intervalHours: scheduleType === "interval" ? Number(intervalHours) : null,
      startDate: new Date().toISOString(),
      endDate: null,
      active: true,
      notes: null,
    });
    const pet = await getPet(petId);
    if (pet) await rescheduleForMedication(med, pet);
    router.back();
    runSync().catch(() => {});
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.paper }} contentContainerStyle={{ padding: space.lg }}>
      <Field label="Medication name" value={name} onChangeText={setName} placeholder="Amoxicillin" autoFocus />

      <Text style={styles.label}>Dosage</Text>
      <View style={{ flexDirection: "row", gap: space.sm, marginBottom: space.lg }}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          keyboardType="decimal-pad"
          value={dosageValue}
          onChangeText={setDosageValue}
          placeholder="1"
          placeholderTextColor={color.inkFaint}
        />
        <Chips options={UNITS} value={dosageUnit} onChange={setDosageUnit} />
      </View>

      <Text style={styles.label}>Schedule</Text>
      <Chips options={SCHEDULES.map((s) => s.type)} labels={SCHEDULES.map((s) => s.label)} value={scheduleType} onChange={setScheduleType} />

      {scheduleType === "fixed_times" && (
        <Field
          label="Times (comma-separated, 24h)"
          value={timesText}
          onChangeText={setTimesText}
          placeholder="08:00, 20:00"
          style={{ marginTop: space.lg }}
        />
      )}
      {scheduleType === "interval" && (
        <Field
          label="Every how many hours"
          value={intervalHours}
          onChangeText={setIntervalHours}
          keyboardType="number-pad"
          style={{ marginTop: space.lg }}
        />
      )}

      <Button label="Save medication" onPress={save} style={{ marginTop: space.lg, opacity: canSave ? 1 : 0.5 }} />
    </ScrollView>
  );
}

function Field(props: { label: string; style?: any } & React.ComponentProps<typeof TextInput>) {
  const { label, style, ...rest } = props;
  return (
    <View style={[{ marginBottom: space.lg }, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={color.inkFaint} {...rest} />
    </View>
  );
}

function Chips<T extends string>({ options, labels, value, onChange }: { options: T[]; labels?: string[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
      {options.map((opt, i) => (
        <Pressable key={opt} onPress={() => onChange(opt)} style={[styles.chip, value === opt && styles.chipActive]}>
          <Text style={[styles.chipLabel, value === opt && styles.chipLabelActive]}>{labels?.[i] ?? opt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: font.body, fontSize: 13, color: color.inkFaint, marginBottom: space.xs },
  input: {
    fontFamily: font.body, fontSize: 16, color: color.ink,
    backgroundColor: color.paperRaised, borderRadius: radius.sm,
    borderWidth: 1, borderColor: color.hairline,
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  chip: { paddingVertical: space.xs, paddingHorizontal: space.md, borderRadius: 999, borderWidth: 1, borderColor: color.hairline, backgroundColor: color.paperRaised },
  chipActive: { backgroundColor: color.clay, borderColor: color.clay },
  chipLabel: { fontFamily: font.body, fontSize: 13, color: color.ink },
  chipLabelActive: { color: color.paper, fontWeight: "700" },
});
