import { useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, Image, Pressable } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { createPet, setPetPhoto } from "@/db/schema";
import { uploadLocalPhoto } from "@/lib/photos";
import { runSync } from "@/lib/sync";
import { Button } from "@/components/Button";
import { color, font, space, radius } from "@/theme/tokens";

export default function NewPet() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");
  const [breed, setBreed] = useState("");
  const [weight, setWeight] = useState("");
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && species.trim().length > 0 && !saving;

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled) setLocalPhotoUri(result.assets[0].uri);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const pet = await createPet({
        name: name.trim(),
        species: species.trim(),
        breed: breed.trim() || null,
        weightKg: weight ? Number(weight) : null,
        photoUri: null,
        notes: null,
      });
      // Upload after the pet exists locally so it's never lost if the
      // upload fails — the pet just ends up with no photo, retryable later.
      if (localPhotoUri) {
        try {
          const marker = await uploadLocalPhoto(pet.id, localPhotoUri);
          await setPetPhoto(pet.id, marker);
        } catch {
          // Offline or upload hiccup: pet is saved, photo just didn't
          // attach. Not surfaced as an error — sync will retry on next
          // successful app foreground once we add a retry queue (skipped
          // for now, this is the same fire-and-forget spirit as runSync).
        }
      }
      router.back();
      runSync().catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.paper }} contentContainerStyle={{ padding: space.lg }}>
      <Pressable onPress={pickPhoto} style={styles.photoPicker}>
        {localPhotoUri ? (
          <Image source={{ uri: localPhotoUri }} style={styles.photo} />
        ) : (
          <Text style={styles.photoPlaceholder}>Add photo</Text>
        )}
      </Pressable>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Biscuit" autoFocus />
      <Field label="Species" value={species} onChangeText={setSpecies} placeholder="Dog, cat, …" />
      <Field label="Breed (optional)" value={breed} onChangeText={setBreed} placeholder="" />
      <Field label="Weight in kg (optional)" value={weight} onChangeText={setWeight} placeholder="12.5" keyboardType="decimal-pad" />
      <Button label={saving ? "Saving…" : "Save pet"} onPress={save} style={{ marginTop: space.md, opacity: canSave ? 1 : 0.5 }} />
    </ScrollView>
  );
}

function Field(props: { label: string } & React.ComponentProps<typeof TextInput>) {
  const { label, ...rest } = props;
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={color.inkFaint} {...rest} />
    </View>
  );
}

const styles = StyleSheet.create({
  photoPicker: {
    width: 96, height: 96, borderRadius: radius.sm, marginBottom: space.lg,
    backgroundColor: color.paperRaised, borderWidth: 1, borderColor: color.hairline,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  photo: { width: 96, height: 96 },
  photoPlaceholder: { fontFamily: font.body, fontSize: 12, color: color.inkFaint },
  label: { fontFamily: font.body, fontSize: 13, color: color.inkFaint, marginBottom: space.xs },
  input: {
    fontFamily: font.body, fontSize: 16, color: color.ink,
    backgroundColor: color.paperRaised, borderRadius: radius.sm,
    borderWidth: 1, borderColor: color.hairline,
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
});
