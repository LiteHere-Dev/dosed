import { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { getPet, historyForPet } from "@/db/schema";
import { exportHistoryPdf } from "@/lib/export";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { color, font, space } from "@/theme/tokens";
import type { Pet, DoseLog } from "@/db/types";

const RANGE_DAYS = 30;

export default function History() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const [pet, setPet] = useState<Pet | null>(null);
  const [rows, setRows] = useState<(DoseLog & { medicationName: string })[]>([]);

  useFocusEffect(
    useCallback(() => {
      getPet(petId).then(setPet);
      const to = new Date();
      const from = new Date(to.getTime() - RANGE_DAYS * 86_400_000);
      historyForPet(petId, from.toISOString(), to.toISOString()).then(setRows);
    }, [petId])
  );

  const rangeLabel = `Last ${RANGE_DAYS} days`;

  return (
    <View style={{ flex: 1, backgroundColor: color.paper, padding: space.lg }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        ListEmptyComponent={<EmptyState title="No history yet" body="Logged doses will show up here." />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.medName}>{item.medicationName}</Text>
            <Text style={styles.meta}>
              {new Date(item.scheduledAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {"  ·  "}{item.status}{item.amountTaken != null ? ` (${item.amountTaken})` : ""}
            </Text>
          </View>
        )}
      />
      {pet && rows.length > 0 && (
        <Button label="Export PDF for vet" onPress={() => exportHistoryPdf(pet, rows, rangeLabel)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  medName: { fontFamily: font.heading, fontSize: 15, color: color.ink },
  meta: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, marginTop: 2, textTransform: "capitalize" },
});
