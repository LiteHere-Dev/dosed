import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { useFocusEffect, useRouter } from "expo-router";
import { listPets } from "@/db/schema";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { PixelCat, PetAvatar } from "@/components/PixelArt";
import { color, font, space, radius } from "@/theme/tokens";
import type { Pet } from "@/db/types";

export default function PetsList() {
  const router = useRouter();
  const [pets, setPets] = useState<Pet[]>([]);

  useFocusEffect(useCallback(() => { listPets().then(setPets); }, []));

  return (
    <View style={{ flex: 1, backgroundColor: color.paper, padding: space.lg }}>
      <FlatList
        data={pets}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<EmptyState title="No pets yet" body="Add your first pet to start a medication schedule." art={<PixelCat pixelSize={8} />} />}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 60).duration(380)} layout={LinearTransition.duration(220)}>
          <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.6 }]} onPress={() => router.push(`/pets/${item.id}`)}>
            <PetAvatar name={item.name} species={item.species} photoUri={item.photoUri} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.species}{item.breed ? ` · ${item.breed}` : ""}</Text>
            </View>
          </Pressable>
          </Animated.View>
        )}
      />
      <Button label="Add a pet" onPress={() => router.push("/pets/new")} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  name: { fontFamily: font.heading, fontSize: 19, color: color.ink },
  meta: { fontFamily: font.body, fontSize: 13, color: color.inkFaint, marginTop: 2 },
});
