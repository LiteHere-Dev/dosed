import { useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Switch, Image, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { createMedication, updateMedication, getPet } from "@/db/schema";
import { rescheduleForMedication } from "@/lib/notifications";
import { uploadLocalMedicationPhoto } from "@/lib/photos";
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
  const [critical, setCritical] = useState(false);
  const [totalQuantity, setTotalQuantity] = useState("");
  const [refillThreshold, setRefillThreshold] = useState("");
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && Number(dosageValue) > 0 && !saving;

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow camera access in your device settings to photograph the prescription label.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true });
    if (!result.canceled) setLocalPhotoUri(result.assets[0].uri);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const qty = totalQuantity.trim() ? Number(totalQuantity) : null;
      const threshold = refillThreshold.trim() ? Number(refillThreshold) : null;
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
        critical,
        totalQuantity: qty,
        remainingQuantity: qty,
        refillThreshold: threshold,
        photoUri: null,
      });

      if (localPhotoUri) {
        try {
          const marker = await uploadLocalMedicationPhoto(med.id, localPhotoUri);
          await updateMedication(med.id, { photoUri: marker });
        } catch (e) {
          console.warn("Prescription photo upload failed:", e);
          Alert.alert("Photo not uploaded", "The medication was saved, but the prescription photo couldn't be uploaded.");
        }
      }

      const pet = await getPet(petId);
      if (pet) await rescheduleForMedication(med, pet);
      router.back();
      runSync().catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.paper }} contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
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

      <View style={styles.criticalRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Critical dose</Text>
          <Text style={styles.hint}>Escalating reminders if it's missed (insulin, seizure meds, etc.)</Text>
        </View>
        <Switch value={critical} onValueChange={setCritical} trackColor={{ true: color.clay }} />
      </View>

      <Text style={[styles.label, { marginTop: space.md }]}>Refill tracking (optional)</Text>
      <View style={{ flexDirection: "row", gap: space.sm, marginBottom: space.lg }}>
        <Field label="Quantity on hand" value={totalQuantity} onChangeText={setTotalQuantity} placeholder={`e.g. 30 ${dosageUnit}s`} keyboardType="decimal-pad" style={{ flex: 1, marginBottom: 0 }} />
        <Field label="Alert below" value={refillThreshold} onChangeText={setRefillThreshold} placeholder="e.g. 5" keyboardType="decimal-pad" style={{ flex: 1, marginBottom: 0 }} />
      </View>

      <Text style={styles.label}>Prescription label photo (optional)</Text>
      <Pressable onPress={takePhoto} style={styles.photoPicker}>
        {localPhotoUri ? <Image source={{ uri: localPhotoUri }} style={styles.photo} /> : (
          <View style={{ alignItems: "center" }}>
            <Feather name="camera" size={20} color={color.inkFaint} />
            <Text style={styles.photoPlaceholder}>Take photo</Text>
          </View>
        )}
      </Pressable>

      <Button label={saving ? "Saving…" : "Save medication"} onPress={save} style={{ marginTop: space.lg, opacity: canSave ? 1 : 0.5 }} />
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
  hint: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, marginTop: 2 },
  criticalRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.md, paddingVertical: space.sm },
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
  photoPicker: {
    width: 96, height: 96, borderRadius: radius.sm, marginBottom: space.lg,
    backgroundColor: color.paperRaised, borderWidth: 1, borderColor: color.hairline,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  photo: { width: 96, height: 96 },
  photoPlaceholder: { fontFamily: font.body, fontSize: 11, color: color.inkFaint, marginTop: 4 },
});
