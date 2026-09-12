import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, Alert, Image } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter, Stack } from "expo-router";
import { getPet, listMedications, deletePet } from "@/db/schema";
import { resolvePhotoUri, deleteUploadedPhoto } from "@/lib/photos";
import { cancelForMedication } from "@/lib/notifications";
import { runSync } from "@/lib/sync";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { color, font, space } from "@/theme/tokens";
import type { Pet, Medication } from "@/db/types";

export default function PetDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [pet, setPet] = useState<Pet | null>(null);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getPet(id).then((p) => {
        setPet(p);
        if (p?.photoUri) resolvePhotoUri(p.photoUri).then(setPhotoUri).catch(() => setPhotoUri(null));
        else setPhotoUri(null);
      });
      listMedications(id).then(setMeds);
    }, [id])
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.paper, padding: space.lg }}>
      <Stack.Screen options={{ title: pet?.name ?? "" }} />
      {photoUri && <Image source={{ uri: photoUri }} style={styles.photo} />}
      {pet && (
        <Text style={styles.subtitle}>
          {pet.species}{pet.breed ? ` · ${pet.breed}` : ""}{pet.weightKg ? ` · ${pet.weightKg} kg` : ""}
        </Text>
      )}
      <FlatList
        data={meds}
        keyExtractor={(m) => m.id}
        style={{ marginTop: space.lg }}
        ListEmptyComponent={<EmptyState title="No medications" body="Add one to start scheduling reminders." />}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/meds/${item.id}`)}>
            <Text style={styles.medName}>{item.name}{!item.active ? " (inactive)" : ""}</Text>
            <Text style={styles.meta}>{item.dosageValue} {item.dosageUnit} · {scheduleLabel(item)}</Text>
          </Pressable>
        )}
      />
      <View style={{ gap: space.sm }}>
        <Button label="Add medication" onPress={() => router.push({ pathname: "/meds/new", params: { petId: id } })} />
        <Button label="View history / export" variant="quiet" onPress={() => router.push(`/history/${id}`)} />
        <Button
          label="Delete pet"
          variant="danger"
          onPress={() =>
            Alert.alert("Delete pet?", "This also removes its medications and dose history.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                  await Promise.all(meds.map((m) => cancelForMedication(m.id)));
                  deleteUploadedPhoto(pet?.photoUri ?? null).catch(() => {}); // best-effort, see photos.ts
                  await deletePet(id);
                  router.back();
                  runSync().catch(() => {});
                },
              },
            ])
          }
        />
      </View>
    </View>
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
  medName: { fontFamily: font.heading, fontSize: 17, color: color.ink },
  meta: { fontFamily: font.body, fontSize: 13, color: color.inkFaint, marginTop: 2 },
});
