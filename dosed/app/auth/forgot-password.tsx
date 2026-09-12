import { useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { requestPasswordReset } from "@/lib/api";
import { Button } from "@/components/Button";
import { color, font, space, radius } from "@/theme/tokens";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await requestPasswordReset(email.trim().toLowerCase());
    } finally {
      // Same message whether or not the account exists — matches the
      // server's deliberately uninformative response, so the UI doesn't
      // leak what the API is already careful not to.
      setSent(true);
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          If an account exists for {email.trim()}, a reset link is on its way. Tapping it opens Dosed
          directly to the reset screen.
        </Text>
        <Button label="Back to sign in" variant="quiet" onPress={() => router.replace("/auth/login")} style={{ marginTop: space.lg }} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Reset your password</Text>
      <Text style={styles.subtitle}>We'll email you a link to set a new one.</Text>
      <TextInput
        style={styles.input} placeholder="Email" placeholderTextColor={color.inkFaint}
        autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}
      />
      <Button label={busy ? "Sending…" : "Send reset link"} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.paper, padding: space.xl, justifyContent: "center" },
  title: { fontFamily: font.heading, fontSize: 26, color: color.ink, textAlign: "center" },
  subtitle: { fontFamily: font.body, fontSize: 14, color: color.inkFaint, textAlign: "center", marginTop: space.xs, marginBottom: space.xl },
  input: {
    fontFamily: font.body, fontSize: 16, color: color.ink,
    backgroundColor: color.paperRaised, borderRadius: radius.sm,
    borderWidth: 1, borderColor: color.hairline,
    paddingHorizontal: space.md, paddingVertical: space.sm, marginBottom: space.md,
  },
});
