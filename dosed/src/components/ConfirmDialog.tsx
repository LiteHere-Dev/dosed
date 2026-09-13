import { useEffect, useRef } from "react";
import { Modal, View, Text, Pressable, StyleSheet, Animated } from "react-native";
import { color, font, space, radius, motion } from "@/theme/tokens";

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Replaces the OS's native Alert.alert everywhere in the app that needs a
 * confirm/cancel prompt — the native one can't be themed (it's the grey
 * Android/iOS system dialog regardless of app styling), which stands out
 * badly against the paper/clay palette. Backed by the app's own `motion`
 * tokens: ease-out scale-in on enter, ease-in fade on exit, matching the
 * rest of the app's animation language rather than inventing a new curve
 * for just this component.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  onCancel,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (visible) {
      opacity.setValue(0);
      scale.setValue(0.96);
      Animated.timing(opacity, { toValue: 1, duration: motion.durationEnter, easing: motion.easeOut, useNativeDriver: true }).start();
      Animated.timing(scale, { toValue: 1, duration: motion.durationEnter, easing: motion.easeOut, useNativeDriver: true }).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
          {/* Stop taps on the card itself from bubbling to the backdrop's onPress (which would dismiss it) */}
          <Pressable onPress={() => {}}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
            <View style={styles.row}>
              <Pressable onPress={onCancel} style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} hitSlop={8}>
                <Text style={styles.cancelLabel}>{cancelLabel}</Text>
              </Pressable>
              <Pressable onPress={onConfirm} style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} hitSlop={8}>
                <Text style={[styles.confirmLabel, destructive && styles.destructiveLabel]}>{confirmLabel}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: color.overlay, alignItems: "center", justifyContent: "center", padding: space.xl },
  card: {
    backgroundColor: color.paper, borderRadius: radius.md, padding: space.lg,
    width: "100%", maxWidth: 340, borderWidth: 1, borderColor: color.hairline,
    shadowColor: color.ink, shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  title: { fontFamily: font.heading, fontSize: 18, color: color.ink, marginBottom: space.xs },
  message: { fontFamily: font.body, fontSize: 14, color: color.inkFaint, lineHeight: 20 },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: space.lg, marginTop: space.lg },
  btn: { paddingVertical: space.xs, paddingHorizontal: space.sm },
  btnPressed: { opacity: 0.6 },
  cancelLabel: { fontFamily: font.body, fontSize: 15, color: color.inkFaint, fontWeight: "600" },
  confirmLabel: { fontFamily: font.body, fontSize: 15, color: color.clayDeep, fontWeight: "700" },
  destructiveLabel: { color: color.danger },
});
