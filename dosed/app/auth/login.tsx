import { useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { login, ApiClientError } from "@/lib/api";
import { runSync } from "@/lib/sync";
import { Button } from "@/components/Button";
import { color, font, space, radius } from "@/theme/tokens";

export default function Login() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await login(identifier.trim(), password);
      await runSync();
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "account_locked") {
        setError("Too many failed attempts. Try again in a few minutes.");
      } else {
        setError("Wrong email/username or password.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Dosed</Text>
      <Text style={styles.subtitle}>Sign in to sync your pets across devices.</Text>

      <TextInput
        style={styles.input} placeholder="Email or username" placeholderTextColor={color.inkFaint}
        autoCapitalize="none" value={identifier} onChangeText={setIdentifier}
      />
      <TextInput
        style={styles.input} placeholder="Password" placeholderTextColor={color.inkFaint}
        secureTextEntry value={password} onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}

      <Button label={busy ? "Signing in…" : "Sign in"} onPress={submit} style={{ marginTop: space.md }} />
      <Pressable onPress={() => router.push("/auth/forgot-password")} style={{ marginTop: space.lg }}>
        <Text style={styles.link}>Forgot your password?</Text>
      </Pressable>
      <Pressable onPress={() => router.push("/auth/register")} style={{ marginTop: space.sm }}>
        <Text style={styles.link}>New here? Create an account</Text>
      </Pressable>

      <Text style={styles.legalNotice}>
        <Text style={styles.legalLink} onPress={() => router.push("/legal/terms")}>Terms & Conditions</Text>
        {"  •  "}
        <Text style={styles.legalLink} onPress={() => router.push("/legal/privacy")}>Privacy Policy</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.paper, padding: space.xl, justifyContent: "center" },
  title: { fontFamily: font.heading, fontSize: 36, color: color.ink, textAlign: "center" },
  subtitle: { fontFamily: font.body, fontSize: 14, color: color.inkFaint, textAlign: "center", marginTop: space.xs, marginBottom: space.xl },
  input: {
    fontFamily: font.body, fontSize: 16, color: color.ink,
    backgroundColor: color.paperRaised, borderRadius: radius.sm,
    borderWidth: 1, borderColor: color.hairline,
    paddingHorizontal: space.md, paddingVertical: space.sm, marginBottom: space.md,
  },
  error: { fontFamily: font.body, fontSize: 13, color: color.danger, marginBottom: space.sm },
  link: { fontFamily: font.body, fontSize: 14, color: color.clayDeep, textAlign: "center" },
  legalNotice: { textAlign: "center", marginTop: space.xxl },
  legalLink: { fontFamily: font.body, fontSize: 12, color: color.inkFaint },
});
