import { useCallback, useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert, ScrollView, Pressable, Image, Switch } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { getMedication, getPet, setMedicationActive, updateMedication, recordDoseAndDecrement, deleteMedication } from "@/db/schema";
import { cancelForMedication, rescheduleForMedication } from "@/lib/notifications";
import { raiseRefillAlert } from "@/lib/refill";
import { resolvePhotoUri, uploadLocalMedicationPhoto, deleteUploadedPhoto } from "@/lib/photos";
import { runSync } from "@/lib/sync";
import { Button } from "@/components/Button";
import { color, font, space, radius } from "@/theme/tokens";
import type { Medication, Pet } from "@/db/types";

export default function MedicationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [med, setMed] = useState<Medication | null>(null);
  const [pet, setPet] = useState<Pet | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);

  const [critical, setCritical] = useState(false);
  const [totalQuantity, setTotalQuantity] = useState("");
  const [remainingQuantity, setRemainingQuantity] = useState("");
  const [refillThreshold, setRefillThreshold] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const m = await getMedication(id);
    setMed(m);
    if (m) {
      setPet(await getPet(m.petId));
      setCritical(m.critical);
      setTotalQuantity(m.totalQuantity != null ? String(m.totalQuantity) : "");
      setRemainingQuantity(m.remainingQuantity != null ? String(m.remainingQuantity) : "");
      setRefillThreshold(m.refillThreshold != null ? String(m.refillThreshold) : "");
      if (m.photoUri) resolvePhotoUri(m.photoUri).then(setPhotoUri).catch(() => setPhotoUri(null));
      else setPhotoUri(null);
    }
    setDirty(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!med) return null;

  const markDirty = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow camera access in your device settings to photograph the prescription label.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true });
    if (!result.canceled) { setLocalPhotoUri(result.assets[0].uri); setDirty(true); }
  };

  const toggleActive = async () => {
    const next = !med.active;
    await setMedicationActive(med.id, next);
    if (!next) await cancelForMedication(med.id);
    router.back();
    runSync().catch(() => {});
  };

  const logAsNeededDose = async () => {
    const { crossedRefillThreshold, medication } = await recordDoseAndDecrement(med.id, new Date().toISOString(), "taken");
    if (crossedRefillThreshold && medication && pet) raiseRefillAlert(medication, pet).catch(() => {});
    router.back();
    runSync().catch(() => {});
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      await updateMedication(med.id, {
        critical,
        totalQuantity: totalQuantity.trim() ? Number(totalQuantity) : null,
        remainingQuantity: remainingQuantity.trim() ? Number(remainingQuantity) : null,
        refillThreshold: refillThreshold.trim() ? Number(refillThreshold) : null,
      });
      if (localPhotoUri) {
        try {
          const marker = await uploadLocalMedicationPhoto(med.id, localPhotoUri);
          await updateMedication(med.id, { photoUri: marker });
          deleteUploadedPhoto(med.photoUri).catch(() => {});
        } catch (e) {
          console.warn("Prescription photo upload failed:", e);
          Alert.alert("Photo not updated", "Your other changes were saved, but the new photo couldn't be uploaded.");
        }
      }
      const updated = await getMedication(med.id);
      if (updated && pet && updated.critical !== med.critical) await rescheduleForMedication(updated, pet); // escalation schedule depends on critical
      await load();
      setLocalPhotoUri(null);
      runSync().catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  const lowStock = med.remainingQuantity != null && med.refillThreshold != null && med.remainingQuantity <= med.refillThreshold;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.paper }} contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
      <View style={styles.headerRow}>
        <Text style={styles.name}>{med.name}</Text>
        {med.critical ? <Text style={styles.criticalBadge}>critical</Text> : null}
      </View>
      <Text style={styles.line}>{med.dosageValue} {med.dosageUnit}</Text>
      <Text style={styles.line}>
        {med.scheduleType === "as_needed" ? "As needed"
          : med.scheduleType === "interval" ? `Every ${med.intervalHours} hours`
          : `Daily at ${med.times.join(", ")}`}
      </Text>
      {med.notes && <Text style={styles.line}>{med.notes}</Text>}
      {lowStock && <Text style={[styles.line, styles.lowStock]}>Running low — {med.remainingQuantity} {med.dosageUnit} left</Text>}

      {med.scheduleType === "as_needed" && med.active && (
        <Button label="Log a dose now" onPress={logAsNeededDose} style={{ marginTop: space.lg }} />
      )}

      <Text style={styles.sectionTitle}>Prescription photo</Text>
      <Pressable onPress={takePhoto} style={styles.photoPicker}>
        {localPhotoUri || photoUri ? (
          <Image source={{ uri: localPhotoUri ?? photoUri! }} style={styles.photo} />
        ) : (
          <View style={{ alignItems: "center" }}>
            <Feather name="camera" size={20} color={color.inkFaint} />
            <Text style={styles.photoPlaceholder}>Take photo</Text>
          </View>
        )}
      </Pressable>

      <View style={styles.criticalRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Critical dose</Text>
          <Text style={styles.hint}>Escalating reminders if it's missed</Text>
        </View>
        <Switch value={critical} onValueChange={markDirty(setCritical)} trackColor={{ true: color.clay }} />
      </View>

      <Text style={styles.sectionTitle}>Refill tracking</Text>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Field label="Remaining" value={remainingQuantity} onChangeText={markDirty(setRemainingQuantity)} keyboardType="decimal-pad" style={{ flex: 1 }} />
        <Field label="Total when full" value={totalQuantity} onChangeText={markDirty(setTotalQuantity)} keyboardType="decimal-pad" style={{ flex: 1 }} />
        <Field label="Alert below" value={refillThreshold} onChangeText={markDirty(setRefillThreshold)} keyboardType="decimal-pad" style={{ flex: 1 }} />
      </View>

      {dirty && <Button label={saving ? "Saving…" : "Save changes"} onPress={saveChanges} style={{ marginTop: space.md }} />}

      <Button
        label={med.active ? "Mark inactive" : "Reactivate"}
        variant={med.active ? "danger" : "primary"}
        onPress={toggleActive}
        style={{ marginTop: space.xl }}
      />
      <Button
        label="Delete medication"
        variant="danger"
        onPress={() =>
          Alert.alert("Delete medication?", "This also removes its dose history.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: async () => {
                await cancelForMedication(med.id);
                deleteUploadedPhoto(med.photoUri).catch(() => {});
                await deleteMedication(med.id);
                router.back();
                runSync().catch(() => {});
              },
            },
          ])
        }
        style={{ marginTop: space.sm }}
      />
    </ScrollView>
  );
}

function Field({ label, style, ...rest }: { label: string; style?: any } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={style}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={color.inkFaint} {...rest} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm },
  name: { fontFamily: font.heading, fontSize: 24, color: color.ink },
  criticalBadge: {
    fontFamily: font.body, fontSize: 10, fontWeight: "700", textTransform: "uppercase",
    color: color.paper, backgroundColor: color.amber, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  line: { fontFamily: font.body, fontSize: 15, color: color.inkFaint, marginBottom: space.xs },
  lowStock: { color: color.danger, fontWeight: "700" },
  sectionTitle: { fontFamily: font.heading, fontSize: 15, color: color.ink, marginTop: space.xl, marginBottom: space.sm },
  hint: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, marginTop: 2 },
  criticalRow: { flexDirection: "row", alignItems: "center" },
  label: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, marginBottom: space.xs },
  input: {
    fontFamily: font.body, fontSize: 15, color: color.ink,
    backgroundColor: color.paperRaised, borderRadius: radius.sm,
    borderWidth: 1, borderColor: color.hairline,
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  photoPicker: {
    width: 96, height: 96, borderRadius: radius.sm,
    backgroundColor: color.paperRaised, borderWidth: 1, borderColor: color.hairline,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  photo: { width: 96, height: 96 },
  photoPlaceholder: { fontFamily: font.body, fontSize: 11, color: color.inkFaint, marginTop: 4 },
});
