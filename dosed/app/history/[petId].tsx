import { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, Modal, TextInput, Pressable, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { getPet, historyForPet, listHealthLogs } from "@/db/schema";
import { exportHistoryPdf, emailHistoryToVet } from "@/lib/export";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { color, font, space, radius } from "@/theme/tokens";
import type { Pet, DoseLog, HealthLog } from "@/db/types";

const RANGE_DAYS = 30;

export default function History() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const [pet, setPet] = useState<Pet | null>(null);
  const [rows, setRows] = useState<(DoseLog & { medicationName: string })[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [vetModalOpen, setVetModalOpen] = useState(false);
  const [vetEmail, setVetEmail] = useState("");
  const [sending, setSending] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const to = new Date();
      const from = new Date(to.getTime() - RANGE_DAYS * 86_400_000);
      getPet(petId).then((p) => { setPet(p); setVetEmail(p?.vetEmail ?? ""); });
      historyForPet(petId, from.toISOString(), to.toISOString()).then(setRows);
      listHealthLogs(petId, from.toISOString(), to.toISOString()).then(setHealthLogs);
    }, [petId])
  );

  const rangeLabel = `Last ${RANGE_DAYS} days`;

  const sendToVet = async () => {
    if (!pet || !/\S+@\S+\.\S+/.test(vetEmail.trim()) || sending) return;
    setSending(true);
    try {
      await emailHistoryToVet(pet, rows, healthLogs, rangeLabel, vetEmail.trim());
      setVetModalOpen(false);
      Alert.alert("Sent", `${pet.name}'s summary was emailed to ${vetEmail.trim()}.`);
    } catch (e) {
      Alert.alert("Couldn't send", "Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

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
              {item.loggedByLabel ? ` · given by ${item.loggedByLabel}` : ""}
            </Text>
          </View>
        )}
      />
      {pet && rows.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Button label="Export PDF for vet" onPress={() => exportHistoryPdf(pet, rows, rangeLabel, healthLogs)} />
          <Button label="Email summary to vet" variant="quiet" onPress={() => setVetModalOpen(true)} />
        </View>
      )}

      <Modal visible={vetModalOpen} transparent animationType="fade" onRequestClose={() => setVetModalOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVetModalOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.modalTitle}>Email summary to vet</Text>
            <Text style={styles.modalSubtitle}>Sends {rangeLabel.toLowerCase()} of dose history and health logs as a PDF.</Text>
            <TextInput
              style={styles.input}
              value={vetEmail}
              onChangeText={setVetEmail}
              placeholder="vet@clinic.com"
              placeholderTextColor={color.inkFaint}
              autoCapitalize="none"
              keyboardType="email-address"
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setVetModalOpen(false)} hitSlop={8}><Text style={styles.cancelLabel}>Cancel</Text></Pressable>
              <Pressable onPress={sendToVet} hitSlop={8} disabled={sending}>
                {sending ? <ActivityIndicator color={color.clayDeep} /> : <Text style={styles.sendLabel}>Send</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  medName: { fontFamily: font.heading, fontSize: 15, color: color.ink },
  meta: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, marginTop: 2, textTransform: "capitalize" },
  backdrop: { flex: 1, backgroundColor: color.overlay, alignItems: "center", justifyContent: "center", padding: space.xl },
  card: { backgroundColor: color.paper, borderRadius: radius.md, padding: space.lg, width: "100%", maxWidth: 360, borderWidth: 1, borderColor: color.hairline },
  modalTitle: { fontFamily: font.heading, fontSize: 17, color: color.ink, marginBottom: space.xs },
  modalSubtitle: { fontFamily: font.body, fontSize: 13, color: color.inkFaint, marginBottom: space.md },
  input: {
    fontFamily: font.body, fontSize: 15, color: color.ink, backgroundColor: color.paperRaised,
    borderRadius: radius.sm, borderWidth: 1, borderColor: color.hairline, paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: space.lg, marginTop: space.lg },
  cancelLabel: { fontFamily: font.body, fontSize: 15, color: color.inkFaint, fontWeight: "600" },
  sendLabel: { fontFamily: font.body, fontSize: 15, color: color.clayDeep, fontWeight: "700" },
});
