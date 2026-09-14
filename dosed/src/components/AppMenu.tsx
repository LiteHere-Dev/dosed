import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet, Animated, Dimensions, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { logout } from "@/lib/api";
import { listPets, listMedications, deletePet, resetDb } from "@/db/schema";
import { deleteUploadedPhoto } from "@/lib/photos";
import { cancelForMedication } from "@/lib/notifications";
import { runSync } from "@/lib/sync";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { color, font, space } from "@/theme/tokens";
import type { Pet } from "@/db/types";

const PANEL_WIDTH = Math.min(300, Dimensions.get("window").width * 0.8);

interface Props {
  visible: boolean;
  onClose: () => void;
}

// Built with the plain RN Modal + Animated (both built into react-native
// itself) rather than a drawer-navigation library: this is a one-off menu,
// not app-wide tab/stack navigation, and pulling in a navigation library
// for one sliding panel isn't worth the extra native surface.
export function AppMenu({ visible, onClose }: Props) {
  const router = useRouter();
  const slide = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [pets, setPets] = useState<Pet[]>([]);
  const [expandedPetId, setExpandedPetId] = useState<string | null>(null);
  const [petPendingDelete, setPetPendingDelete] = useState<Pet | null>(null);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : -PANEL_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start();
    // Reload the pet list every time the menu opens, rather than once on
    // mount — a pet added/deleted elsewhere in the app should show up
    // here next time someone opens the menu, not only after a full
    // remount.
    if (visible) listPets().then(setPets);
    else setExpandedPetId(null);
  }, [visible]);

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };

  const confirmSignOut = async () => {
    setConfirmingSignOut(false);
    onClose();
    await logout();
    // Wipes the local DB too: this device's copy of the data is only a
    // cache of the account's data, and leaving it behind after sign-out
    // would let the next person who signs in on this device see it.
    await resetDb();
    router.replace("/auth/login");
  };

  const doDeletePet = async () => {
    const pet = petPendingDelete;
    setPetPendingDelete(null);
    if (!pet) return;
    const meds = await listMedications(pet.id);
    await Promise.all(meds.map((m) => cancelForMedication(m.id)));
    deleteUploadedPhoto(pet.photoUri ?? null).catch(() => {}); // best-effort, see photos.ts
    await deletePet(pet.id);
    setPets((prev) => prev.filter((p) => p.id !== pet.id));
    setExpandedPetId(null);
    runSync().catch(() => {});
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.panel, { transform: [{ translateX: slide }] }]}>
          <Text style={styles.brand}>Dosed</Text>

          <ScrollView style={styles.nav} showsVerticalScrollIndicator={false}>
            <MenuItem icon="calendar" label="Today" onPress={() => go("/")} />
            <MenuItem icon="heart" label="Pets" onPress={() => go("/pets")} />
            <MenuItem icon="settings" label="Settings" onPress={() => go("/settings")} />

            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>Pets</Text>

            {pets.length === 0 ? (
              <Pressable
                onPress={() => go("/pets/new")}
                style={({ pressed }) => [styles.addPetPrompt, pressed && { opacity: 0.6 }]}
              >
                <Feather name="plus-circle" size={18} color={color.clayDeep} />
                <Text style={styles.addPetPromptLabel}>Add your first pet</Text>
              </Pressable>
            ) : (
              pets.map((pet) => {
                const expanded = expandedPetId === pet.id;
                return (
                  <View key={pet.id}>
                    <Pressable
                      onPress={() => setExpandedPetId(expanded ? null : pet.id)}
                      style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
                    >
                      <Feather name="chevron-right" size={16} color={color.inkFaint} style={expanded ? styles.chevronOpen : undefined} />
                      <Text style={styles.itemLabel}>{pet.name}</Text>
                    </Pressable>
                    {expanded && (
                      <View style={styles.subItems}>
                        <SubItem
                          icon="plus"
                          label="Add medication"
                          onPress={() => go(`/meds/new?petId=${pet.id}`)}
                        />
                        <SubItem
                          icon="clock"
                          label="View history"
                          onPress={() => go(`/history/${pet.id}`)}
                        />
                        <SubItem
                          icon="trash-2"
                          label="Delete pet"
                          danger
                          onPress={() => setPetPendingDelete(pet)}
                        />
                      </View>
                    )}
                  </View>
                );
              })
            )}

            <View style={styles.divider} />
            <MenuItem icon="file-text" label="Terms & Conditions" onPress={() => go("/legal/terms")} />
            <MenuItem icon="shield" label="Privacy Policy" onPress={() => go("/legal/privacy")} />
          </ScrollView>

          <Pressable onPress={() => setConfirmingSignOut(true)} style={styles.signOutRow} hitSlop={8}>
            <Feather name="log-out" size={18} color={color.danger} />
            <Text style={styles.signOutLabel}>Sign out</Text>
          </Pressable>
        </Animated.View>
      </Modal>

      <ConfirmDialog
        visible={confirmingSignOut}
        title="Sign out?"
        message="This clears Dosed's data from this device. It stays safe on the server."
        confirmLabel="Sign out"
        destructive
        onConfirm={confirmSignOut}
        onCancel={() => setConfirmingSignOut(false)}
      />

      <ConfirmDialog
        visible={petPendingDelete !== null}
        title={`Delete ${petPendingDelete?.name ?? "this pet"}?`}
        message="This also removes its medications and dose history."
        confirmLabel="Delete"
        destructive
        onConfirm={doDeletePet}
        onCancel={() => setPetPendingDelete(null)}
      />
    </>
  );
}

function MenuItem({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}>
      <Feather name={icon} size={18} color={color.ink} />
      <Text style={styles.itemLabel}>{label}</Text>
    </Pressable>
  );
}

/** A per-pet action row, indented under its pet's expanded dropdown. */
function SubItem({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.subItem, pressed && { opacity: 0.6 }]}>
      <Feather name={icon} size={16} color={danger ? color.danger : color.inkFaint} />
      <Text style={[styles.subItemLabel, danger && styles.subItemLabelDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: color.overlay },
  panel: {
    position: "absolute", top: 0, bottom: 0, left: 0, width: PANEL_WIDTH,
    backgroundColor: color.paper, paddingTop: 64, paddingHorizontal: space.lg,
    borderRightWidth: 1, borderRightColor: color.hairline,
  },
  brand: { fontFamily: font.heading, fontSize: 24, color: color.ink, marginBottom: space.xl },
  nav: { flex: 1 },
  item: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  itemLabel: { fontFamily: font.body, fontSize: 15, color: color.ink },
  divider: { height: 1, backgroundColor: color.hairline, marginVertical: space.md },
  sectionLabel: {
    fontFamily: font.body, fontSize: 11, fontWeight: "700", letterSpacing: 0.5,
    textTransform: "uppercase", color: color.inkFaint, marginBottom: space.xs,
  },
  chevronOpen: { transform: [{ rotate: "90deg" }] },
  subItems: { marginLeft: space.lg, marginBottom: space.xs },
  subItem: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
  subItemLabel: { fontFamily: font.body, fontSize: 14, color: color.ink },
  subItemLabelDanger: { color: color.danger },
  addPetPrompt: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    paddingVertical: space.sm, paddingHorizontal: space.sm, marginBottom: space.xs,
    backgroundColor: color.mossFaint, borderRadius: 10,
  },
  addPetPromptLabel: { fontFamily: font.body, fontSize: 14, fontWeight: "700", color: color.clayDeep },
  signOutRow: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    paddingVertical: space.md, marginBottom: space.lg,
  },
  signOutLabel: { fontFamily: font.body, fontSize: 15, color: color.danger, fontWeight: "600" },
});
