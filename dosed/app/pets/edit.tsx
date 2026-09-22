import { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, Alert, Image } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { getPet, updatePet } from "@/db/schema";
import { uploadLocalPhoto, deleteUploadedPhoto } from "@/lib/photos";
import { runSync } from "@/lib/sync";
import { Button } from "@/components/Button";
import { PetAvatar } from "@/components/PixelArt";
import { color, font, space, radius } from "@/theme/tokens";
import type { Pet } from "@/db/types";

export default function EditPet() {
  const router = useRouter();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const [pet, setPet] = useState<Pet | null>(null);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");
  const [breed, setBreed] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [vetEmail, setVetEmail] = useState("");
  const [newPhotoUri, setNewPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPet(petId).then((p) => {
      if (!p) return;
      setPet(p);
      setName(p.name);
      setSpecies(p.species);
      setBreed(p.breed ?? "");
      setWeight(p.weightKg != null ? String(p.weightKg) : "");
      setNotes(p.notes ?? "");
      setVetEmail(p.vetEmail ?? "");
    });
  }, [petId]);

  const weightNum = weight.trim() === "" ? null : Number(weight.replace(",", "."));
  const weightInvalid = weightNum !== null && (!Number.isFinite(weightNum) || weightNum <= 0);
  const vetEmailInvalid = vetEmail.trim().length > 0 && !/\S+@\S+\.\S+/.test(vetEmail.trim());
  const canSave = !!pet && name.trim().length > 0 && species.trim().length > 0 && !weightInvalid && !vetEmailInvalid && !saving;

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access in your device settings to change the pet photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled) setNewPhotoUri(result.assets[0].uri);
  };

  const save = async () => {
    if (!canSave || !pet) return;
    setSaving(true);
    try {
      // Text fields save first, so a failed photo upload never loses the edits.
      await updatePet(pet.id, {
        name: name.trim(),
        species: species.trim(),
        breed: breed.trim() || null,
        weightKg: weightNum,
        notes: notes.trim() || null,
        vetEmail: vetEmail.trim() || null,
      });

      if (newPhotoUri) {
        try {
          const marker = await uploadLocalPhoto(pet.id, newPhotoUri);
          await updatePet(pet.id, { photoUri: marker });
          deleteUploadedPhoto(pet.photoUri).catch(() => {}); // best-effort cleanup of the replaced photo
        } catch (e) {
          console.warn("Photo upload failed:", e);
          const reason = e instanceof Error ? e.message : String(e);
          Alert.alert("Photo not updated", `Your changes were saved, but the new photo couldn't be uploaded.\n\nReason: ${reason}`);
        }
      }
      router.back();
      runSync().catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  if (!pet) return <View style={{ flex: 1, backgroundColor: color.paper }} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.paper }} contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
      <Animated.View entering={FadeInDown.duration(380)} style={styles.photoRow}>
        <Pressable onPress={pickPhoto} style={styles.photoWrap}>
          {newPhotoUri ? (
            <Image source={{ uri: newPhotoUri }} style={styles.photo} />
          ) : (
            <PetAvatar name={name || pet.name} species={species || pet.species} photoUri={pet.photoUri} size={96} />
          )}
          <View style={styles.cameraBadge}>
            <Feather name="camera" size={14} color={color.paper} />
          </View>
        </Pressable>
        <Text style={styles.photoHint}>Tap the photo to change it</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(380)}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Biscuit" />
        <Field label="Species" value={species} onChangeText={setSpecies} placeholder="Dog, cat, …" />
        <Field label="Breed (optional)" value={breed} onChangeText={setBreed} />
        <Field
          label="Weight in kg (optional)"
          value={weight}
          onChangeText={setWeight}
          placeholder="12.5"
          keyboardType="decimal-pad"
          error={weightInvalid ? "Enter a number greater than 0" : undefined}
        />
        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Allergies, vet details, anything worth remembering" multiline style={{ minHeight: 84, textAlignVertical: "top" }} />
        <Field
          label="Vet's email (optional)"
          value={vetEmail}
          onChangeText={setVetEmail}
          placeholder="vet@clinic.com"
          keyboardType="email-address"
          autoCapitalize="none"
          error={vetEmailInvalid ? "Enter a valid email address" : undefined}
        />
      </Animated.View>

      <Button label={saving ? "Saving…" : "Save changes"} onPress={save} style={{ marginTop: space.md, opacity: canSave ? 1 : 0.5 }} />
    </ScrollView>
  );
}

function Field({ label, error, style, ...rest }: { label: string; error?: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={[styles.input, error ? { borderColor: color.danger } : null, style]} placeholderTextColor={color.inkFaint} {...rest} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  photoRow: { alignItems: "center", marginBottom: space.xl },
  photoWrap: { width: 96, height: 96 },
  photo: { width: 96, height: 96, borderRadius: 48 },
  cameraBadge: {
    position: "absolute", right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15,
    backgroundColor: color.clay, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: color.paper,
  },
  photoHint: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, marginTop: space.sm },
  label: { fontFamily: font.body, fontSize: 13, color: color.inkFaint, marginBottom: space.xs },
  input: {
    fontFamily: font.body, fontSize: 16, color: color.ink,
    backgroundColor: color.paperRaised, borderRadius: radius.sm,
    borderWidth: 1, borderColor: color.hairline,
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  error: { fontFamily: font.body, fontSize: 12, color: color.danger, marginTop: space.xs },
});
