import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, Image } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useFocusEffect, useLocalSearchParams, useRouter, Stack } from "expo-router";
import { getPet, listMedications, deletePet } from "@/db/schema";
import { resolvePhotoUri, deleteUploadedPhoto } from "@/lib/photos";
import { cancelForMedication } from "@/lib/notifications";
import { runSync } from "@/lib/sync";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PetAvatar } from "@/components/PixelArt";
import { Feather } from "@expo/vector-icons";
import { EmptyState } from "@/components/EmptyState";
import { color, font, space } from "@/theme/tokens";
import type { Pet, Medication } from "@/db/types";

export default function PetDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [pet, setPet] = useState<Pet | null>(null);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      <Stack.Screen
        options={{
          title: pet?.name ?? "",
          headerRight: () => (
            <Pressable onPress={() => router.push({ pathname: "/pets/edit", params: { petId: id } })} hitSlop={10}>
              <Feather name="edit-2" size={19} color={color.clayDeep} />
            </Pressable>
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
      <FlatList
        data={meds}
        keyExtractor={(m) => m.id}
        style={{ marginTop: space.lg }}
        ListEmptyComponent={<EmptyState title="No medications" body="Add one to start scheduling reminders." />}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 60).duration(380)}>
            <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.6 }]} onPress={() => router.push(`/meds/${item.id}`)}>
              <Text style={styles.medName}>{item.name}{!item.active ? " (inactive)" : ""}</Text>
              <Text style={styles.meta}>{item.dosageValue} {item.dosageUnit} · {scheduleLabel(item)}</Text>
            </Pressable>
          </Animated.View>
        )}
      />
      <View style={{ gap: space.sm }}>
        <Button label="Edit pet" variant="quiet" onPress={() => router.push({ pathname: "/pets/edit", params: { petId: id } })} />
        <Button label="Add medication" onPress={() => router.push({ pathname: "/meds/new", params: { petId: id } })} />
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
