import { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Image } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useFocusEffect, useLocalSearchParams, useRouter, Stack } from "expo-router";
import { getPet, listMedications, listHealthLogs, deletePet } from "@/db/schema";
import { resolvePhotoUri, deleteUploadedPhoto } from "@/lib/photos";
import { cancelForMedication } from "@/lib/notifications";
import { runSync } from "@/lib/sync";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PetAvatar } from "@/components/PixelArt";
import { AdherenceCalendar } from "@/components/AdherenceCalendar";
import { QuickLogButtons } from "@/components/QuickLogButtons";
import { Feather } from "@expo/vector-icons";
import { EmptyState } from "@/components/EmptyState";
import { color, font, space } from "@/theme/tokens";
import type { Pet, Medication, HealthLog } from "@/db/types";

const HEALTH_LABELS: Record<HealthLog["type"], string> = {
  side_effect: "Side effect", mood: "Mood", weight: "Weight", stool: "Stool",
};

export default function PetDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [pet, setPet] = useState<Pet | null>(null);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadHealthLogs = useCallback(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86_400_000);
    listHealthLogs(id, from.toISOString(), to.toISOString()).then((logs) => setHealthLogs(logs.slice(0, 5)));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      getPet(id).then((p) => {
        setPet(p);
        if (p?.photoUri) resolvePhotoUri(p.photoUri).then(setPhotoUri).catch(() => setPhotoUri(null));
        else setPhotoUri(null);
      });
      listMedications(id).then(setMeds);
      loadHealthLogs();
    }, [id, loadHealthLogs])
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.paper }} contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
      <Stack.Screen
        options={{
          title: pet?.name ?? "",
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: space.md }}>
              <Pressable onPress={() => router.push({ pathname: "/pets/share", params: { petId: id, petName: pet?.name ?? "" } })} hitSlop={10}>
                <Feather name="users" size={19} color={color.clayDeep} />
              </Pressable>
              <Pressable onPress={() => router.push({ pathname: "/pets/edit", params: { petId: id } })} hitSlop={10}>
                <Feather name="edit-2" size={19} color={color.clayDeep} />
              </Pressable>
            </View>
          ),
        }}
      />
      {photoUri ? (
        <Animated.Image entering={FadeIn.duration(350)} source={{ uri: photoUri }} style={styles.photo} />
      ) : pet ? (
        <Animated.View entering={FadeIn.duration(300)} style={{ marginBottom: space.md }}><PetAvatar name={pet.name} species={pet.species} size={88} /></Animated.View>
      ) : null}
      {pet && (
        <Text style={styles.subtitle}>
          {pet.species}{pet.breed ? ` · ${pet.breed}` : ""}{pet.weightKg ? ` · ${pet.weightKg} kg` : ""}
        </Text>
      )}

      <View style={{ marginTop: space.lg }}>
        {meds.length === 0 ? (
          <EmptyState title="No medications" body="Add one to start scheduling reminders." />
        ) : (
          meds.map((item, index) => (
            <Animated.View key={item.id} entering={FadeInDown.delay(Math.min(index, 8) * 60).duration(380)}>
              <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.6 }]} onPress={() => router.push(`/meds/${item.id}`)}>
                <View style={styles.medNameRow}>
                  <Text style={styles.medName}>{item.name}{!item.active ? " (inactive)" : ""}</Text>
                  {item.critical ? <Text style={styles.criticalBadge}>critical</Text> : null}
                </View>
                <Text style={styles.meta}>{item.dosageValue} {item.dosageUnit} · {scheduleLabel(item)}</Text>
                {item.remainingQuantity != null && (
                  <Text style={[styles.meta, item.refillThreshold != null && item.remainingQuantity <= item.refillThreshold && styles.lowStock]}>
                    {item.remainingQuantity} {item.dosageUnit} remaining
                  </Text>
                )}
              </Pressable>
            </Animated.View>
          ))
        )}
      </View>

      {pet && (
        <View style={{ marginTop: space.xl }}>
          <Text style={styles.sectionTitle}>Adherence</Text>
          <AdherenceCalendar petId={pet.id} />
        </View>
      )}

      <View style={{ marginTop: space.xl }}>
        <Text style={styles.sectionTitle}>Health log</Text>
        <QuickLogButtons petId={id} onLogged={loadHealthLogs} />
        {healthLogs.length > 0 && (
          <View style={{ marginTop: space.md }}>
            {healthLogs.map((h) => (
              <View key={h.id} style={styles.healthRow}>
                <Text style={styles.healthType}>{HEALTH_LABELS[h.type]}</Text>
                <Text style={styles.healthValue} numberOfLines={1}>{h.value}{h.note ? ` — ${h.note}` : ""}</Text>
                <Text style={styles.healthWhen}>{new Date(h.occurredAt).toLocaleDateString([], { month: "short", day: "numeric" })}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={{ gap: space.sm, marginTop: space.xl }}>
        <Button label="Edit pet" variant="quiet" onPress={() => router.push({ pathname: "/pets/edit", params: { petId: id } })} />
        <Button label="Add medication" onPress={() => router.push({ pathname: "/meds/new", params: { petId: id } })} />
        <Button label="Share with a caregiver" variant="quiet" onPress={() => router.push({ pathname: "/pets/share", params: { petId: id, petName: pet?.name ?? "" } })} />
        <Button label="View history / export" variant="quiet" onPress={() => router.push(`/history/${id}`)} />
        <Button label="Delete pet" variant="danger" onPress={() => setConfirmDelete(true)} />
      </View>
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete pet?"
        message="This also removes its medications and dose history."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await Promise.all(meds.map((m) => cancelForMedication(m.id)));
          deleteUploadedPhoto(pet?.photoUri ?? null).catch(() => {}); // best-effort, see photos.ts
          await deletePet(id);
          router.back();
          runSync().catch(() => {});
        }}
      />
    </ScrollView>
  );
}

function scheduleLabel(m: Medication) {
  if (m.scheduleType === "as_needed") return "As needed";
  if (m.scheduleType === "interval") return `Every ${m.intervalHours}h`;
  return m.times.join(", ");
}

const styles = StyleSheet.create({
  photo: { width: 88, height: 88, borderRadius: 12, marginBottom: space.md },
  subtitle: { fontFamily: font.body, fontSize: 14, color: color.inkFaint },
  card: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  medNameRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  medName: { fontFamily: font.heading, fontSize: 17, color: color.ink },
  criticalBadge: {
    fontFamily: font.body, fontSize: 10, fontWeight: "700", textTransform: "uppercase",
    color: color.paper, backgroundColor: color.amber, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  meta: { fontFamily: font.body, fontSize: 13, color: color.inkFaint, marginTop: 2 },
  lowStock: { color: color.danger, fontWeight: "700" },
  sectionTitle: { fontFamily: font.heading, fontSize: 16, color: color.ink, marginBottom: space.sm },
  healthRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
  healthType: { fontFamily: font.body, fontSize: 12, fontWeight: "700", color: color.clayDeep, width: 78 },
  healthValue: { fontFamily: font.body, fontSize: 13, color: color.ink, flex: 1 },
  healthWhen: { fontFamily: font.body, fontSize: 11, color: color.inkFaint },
});
