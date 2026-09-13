import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet, Animated, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { logout } from "@/lib/api";
import { resetDb } from "@/db/schema";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { color, font, space } from "@/theme/tokens";

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

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : -PANEL_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start();
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

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.panel, { transform: [{ translateX: slide }] }]}>
          <Text style={styles.brand}>Dosed</Text>

          <View style={styles.nav}>
            <MenuItem icon="calendar" label="Today" onPress={() => go("/")} />
            <MenuItem icon="heart" label="Pets" onPress={() => go("/pets")} />
            <MenuItem icon="settings" label="Settings" onPress={() => go("/settings")} />
            <View style={styles.divider} />
            <MenuItem icon="file-text" label="Terms & Conditions" onPress={() => go("/legal/terms")} />
            <MenuItem icon="shield" label="Privacy Policy" onPress={() => go("/legal/privacy")} />
          </View>

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
  signOutRow: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    paddingVertical: space.md, marginBottom: space.lg,
  },
  signOutLabel: { fontFamily: font.body, fontSize: 15, color: color.danger, fontWeight: "600" },
});
