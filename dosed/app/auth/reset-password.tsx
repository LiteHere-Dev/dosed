import { useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { resetPassword, ApiClientError } from "@/lib/api";
import { Button } from "@/components/Button";
import { color, font, space, radius } from "@/theme/tokens";

export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!token) return setError("This link is missing its token — request a new one.");
    if (password.length < 8) return setError("Password needs at least 8 characters.");
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiClientError && err.code === "invalid_or_expired_token"
        ? "This link has expired — request a new one."
        : "Couldn't reset your password.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Password updated</Text>
        <Text style={styles.subtitle}>All your devices have been signed out for safety — sign in again with your new password.</Text>
        <Button label="Go to sign in" onPress={() => router.replace("/auth/login")} style={{ marginTop: space.lg }} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Set a new password</Text>
      <TextInput
        style={styles.input} placeholder="New password (min 8 characters)" placeholderTextColor={color.inkFaint}
        secureTextEntry value={password} onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label={busy ? "Saving…" : "Save new password"} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.paper, padding: space.xl, justifyContent: "center" },
  title: { fontFamily: font.heading, fontSize: 26, color: color.ink, textAlign: "center", marginBottom: space.lg },
  subtitle: { fontFamily: font.body, fontSize: 14, color: color.inkFaint, textAlign: "center", marginBottom: space.lg },
  input: {
    fontFamily: font.body, fontSize: 16, color: color.ink,
    backgroundColor: color.paperRaised, borderRadius: radius.sm,
    borderWidth: 1, borderColor: color.hairline,
    paddingHorizontal: space.md, paddingVertical: space.sm, marginBottom: space.md,
  },
  error: { fontFamily: font.body, fontSize: 13, color: color.danger, marginBottom: space.sm },
});
