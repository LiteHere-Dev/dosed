import { useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { register, ApiClientError } from "@/lib/api";
import { runSync } from "@/lib/sync";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { color, font, space, radius } from "@/theme/tokens";

const ERROR_COPY: Record<string, string> = {
  account_exists: "That email, username, or phone number is already registered.",
  validation_failed: "Check the fields above — one of them isn't in the right format.",
};

export default function Register() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [stayedSignedIn, setStayedSignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (password.length < 8) return setError("Password needs at least 8 characters.");
    setBusy(true);
    try {
      await register(email.trim().toLowerCase(), username.trim(), phone.trim() || null, password, stayedSignedIn);
      await runSync();
      router.replace("/");
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : "";
      setError(ERROR_COPY[code] ?? "Couldn't create your account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>This is what lets your other devices sync.</Text>

      <TextInput style={styles.input} placeholder="Email" placeholderTextColor={color.inkFaint} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Username" placeholderTextColor={color.inkFaint} autoCapitalize="none" value={username} onChangeText={setUsername} />
      <TextInput style={styles.input} placeholder="Phone (optional, e.g. +26876123456)" placeholderTextColor={color.inkFaint} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <TextInput style={styles.input} placeholder="Password (min 8 characters)" placeholderTextColor={color.inkFaint} secureTextEntry value={password} onChangeText={setPassword} />

      <Checkbox
        label="Stay signed in on this device"
        checked={stayedSignedIn}
        onChange={setStayedSignedIn}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.legalNotice}>
        By creating an account you agree to our{" "}
        <Text style={styles.legalLink} onPress={() => router.push("/legal/terms")}>Terms & Conditions</Text>
        {" "}and{" "}
        <Text style={styles.legalLink} onPress={() => router.push("/legal/privacy")}>Privacy Policy</Text>.
      </Text>

      <Button label={busy ? "Creating account…" : "Create account"} onPress={submit} style={{ marginTop: space.md }} />
      <Pressable onPress={() => router.replace("/auth/login")} style={{ marginTop: space.lg }}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.paper, padding: space.xl, justifyContent: "center" },
  title: { fontFamily: font.heading, fontSize: 28, color: color.ink, textAlign: "center" },
  subtitle: { fontFamily: font.body, fontSize: 14, color: color.inkFaint, textAlign: "center", marginTop: space.xs, marginBottom: space.xl },
  input: {
    fontFamily: font.body, fontSize: 16, color: color.ink,
    backgroundColor: color.paperRaised, borderRadius: radius.sm,
    borderWidth: 1, borderColor: color.hairline,
    paddingHorizontal: space.md, paddingVertical: space.sm, marginBottom: space.md,
  },
  error: { fontFamily: font.body, fontSize: 13, color: color.danger, marginTop: space.sm, marginBottom: space.sm },
  legalNotice: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, textAlign: "center", lineHeight: 17, marginTop: space.md },
  legalLink: { fontFamily: font.body, fontSize: 12, color: color.clayDeep, fontWeight: "600" },
  link: { fontFamily: font.body, fontSize: 14, color: color.clayDeep, textAlign: "center" },
});