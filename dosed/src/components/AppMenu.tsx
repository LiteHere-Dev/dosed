import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet, Dimensions, ScrollView } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeInLeft,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
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

const OPEN_MS = 300;
const CLOSE_MS = 230;
const EASE_OUT = Easing.bezierFn(0.22, 1, 0.36, 1);

// The panel and backdrop are driven by one shared value `t` (0 = closed,
// 1 = open). The Modal stays mounted through the closing animation and is
// only unmounted once it has finished — otherwise it would vanish the
// instant `visible` flips to false and the slide-out would never be seen.
export function AppMenu({ visible, onClose }: Props) {
  const router = useRouter();
  const t = useSharedValue(0);
  const [mounted, setMounted] = useState(visible);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [pets, setPets] = useState<Pet[]>([]);
  const [expandedPetId, setExpandedPetId] = useState<string | null>(null);
  const [petPendingDelete, setPetPendingDelete] = useState<Pet | null>(null);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      t.value = withTiming(1, { duration: OPEN_MS, easing: EASE_OUT });
      // Reload the pet list every time the menu opens, rather than once on
      // mount — a pet added/deleted elsewhere in the app should show up
      // here next time someone opens the menu.
      listPets().then(setPets);
      return;
    }
    t.value = withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) });
    setExpandedPetId(null);
    const id = setTimeout(() => setMounted(false), CLOSE_MS + 30);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (t.value - 1) * PANEL_WIDTH }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: t.value }));

  const go = (path: string) => {
    onClose();
    // Navigate once the panel is mostly out of the way, so the slide-out
    // and the next screen's transition don't fight each other.
    setTimeout(() => router.push(path as never), CLOSE_MS - 30);
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
      <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.overlay }, backdropStyle]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[styles.panel, panelStyle]}>
          <Text style={styles.brand}>Dosed</Text>

          <ScrollView style={styles.nav} showsVerticalScrollIndicator={false}>
            <MenuItem index={0} icon="calendar" label="Today" onPress={() => go("/")} />
            <MenuItem index={1} icon="heart" label="Pets" onPress={() => go("/pets")} />
            <MenuItem index={2} icon="settings" label="Settings" onPress={() => go("/settings")} />

            <Animated.View layout={LinearTransition.duration(220)} style={styles.divider} />
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
              pets.map((pet, i) => {
                const expanded = expandedPetId === pet.id;
                return (
                  <Animated.View
                    key={pet.id}
                    entering={FadeInLeft.delay(220 + i * 45).duration(320)}
                    layout={LinearTransition.duration(220)}
                  >
                    <Pressable
                      onPress={() => setExpandedPetId(expanded ? null : pet.id)}
                      style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
                    >
                      <Chevron open={expanded} />
                      <Text style={styles.itemLabel}>{pet.name}</Text>
                    </Pressable>
                    {expanded && (
                      <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(120)} style={styles.subItems}>
                        <SubItem
                          icon="edit-2"
                          label="Edit pet"
                          onPress={() => go(`/pets/edit?petId=${pet.id}`)}
                        />
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
                      </Animated.View>
                    )}
                  </Animated.View>
                );
              })
            )}

            <Animated.View layout={LinearTransition.duration(220)} style={styles.divider} />
            <MenuItem index={pets.length + 4} icon="file-text" label="Terms & Conditions" onPress={() => go("/legal/terms")} />
            <MenuItem index={pets.length + 5} icon="shield" label="Privacy Policy" onPress={() => go("/legal/privacy")} />
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

function MenuItem({ icon, label, onPress, index }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; index: number }) {
  return (
    <Animated.View entering={FadeInLeft.delay(120 + index * 45).duration(320)} layout={LinearTransition.duration(220)}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}>
        <Feather name={icon} size={18} color={color.ink} />
        <Text style={styles.itemLabel}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Chevron that rotates smoothly when its row expands/collapses. */
function Chevron({ open }: { open: boolean }) {
  const r = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    r.value = withTiming(open ? 1 : 0, { duration: 200, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value * 90}deg` }] }));
  return (
    <Animated.View style={st}>
      <Feather name="chevron-right" size={16} color={color.inkFaint} />
    </Animated.View>
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
