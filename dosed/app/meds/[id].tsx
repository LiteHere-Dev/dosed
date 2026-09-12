import { useCallback, useState } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { getMedication, setMedicationActive, logDose, deleteMedication } from "@/db/schema";
import { cancelForMedication } from "@/lib/notifications";
import { runSync } from "@/lib/sync";
import { Button } from "@/components/Button";
import { color, font, space } from "@/theme/tokens";
import type { Medication } from "@/db/types";

export default function MedicationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [med, setMed] = useState<Medication | null>(null);

  useFocusEffect(useCallback(() => { getMedication(id).then(setMed); }, [id]));

  if (!med) return null;

  const toggleActive = async () => {
    const next = !med.active;
    await setMedicationActive(med.id, next);
    if (!next) await cancelForMedication(med.id);
    router.back();
    runSync().catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.paper, padding: space.lg }}>
      <Text style={styles.name}>{med.name}</Text>
      <Text style={styles.line}>{med.dosageValue} {med.dosageUnit}</Text>
      <Text style={styles.line}>
        {med.scheduleType === "as_needed" ? "As needed"
          : med.scheduleType === "interval" ? `Every ${med.intervalHours} hours`
          : `Daily at ${med.times.join(", ")}`}
      </Text>
      {med.notes && <Text style={styles.line}>{med.notes}</Text>}
      {med.scheduleType === "as_needed" && med.active && (
        <Button
          label="Log a dose now"
          onPress={async () => {
            const now = new Date().toISOString();
            await logDose({ medicationId: med.id, scheduledAt: now, takenAt: now, status: "taken", amountTaken: med.dosageValue, note: null });
            router.back();
            runSync().catch(() => {});
          }}
          style={{ marginTop: space.lg }}
        />
      )}
      <Button
        label={med.active ? "Mark inactive" : "Reactivate"}
        variant={med.active ? "danger" : "primary"}
        onPress={toggleActive}
        style={{ marginTop: space.md }}
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
                await deleteMedication(med.id);
                router.back();
                runSync().catch(() => {});
              },
            },
          ])
        }
        style={{ marginTop: space.sm }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: font.heading, fontSize: 24, color: color.ink, marginBottom: space.sm },
  line: { fontFamily: font.body, fontSize: 15, color: color.inkFaint, marginBottom: space.xs },
});
