import { useState } from "react";
import { Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { register, ApiClientError } from "@/lib/api";
import { runSync } from "@/lib/sync";
import { Checkbox } from "@/components/Checkbox";
import { AuthShell, AuthField, MorphButton, Reveal, sleep } from "@/components/AuthShell";
import { color, font, space } from "@/theme/tokens";

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
  const [curtain, setCurtain] = useState(false);

  const submit = async () => {
    setError(null);
    if (password.length < 8) return setError("Password needs at least 8 characters.");
    setBusy(true);
    try {
      await register(email.trim().toLowerCase(), username.trim(), phone.trim() || null, password, stayedSignedIn);
      await runSync();
      setCurtain(true);
      await sleep(360);
      router.replace("/");
    } catch (err) {
      setBusy(false);
      const code = err instanceof ApiClientError ? err.code : "";
      setError(ERROR_COPY[code] ?? "Couldn't create your account.");
    }
  };

  return (
    <AuthShell tagline="Create an account so your pets sync everywhere." curtain={curtain}>
      <Reveal index={0}>
        <Text style={styles.title}>Create account</Text>
      </Reveal>
      <Reveal index={1}>
        <AuthField label="Email" placeholder="you@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} />
      </Reveal>
      <Reveal index={2}>
        <AuthField label="Username" placeholder="Pick a username" autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} />
      </Reveal>
      <Reveal index={3}>
        <AuthField label="Phone (optional)" placeholder="+26876123456" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      </Reveal>
      <Reveal index={4}>
        <AuthField label="Password" placeholder="At least 8 characters" secure value={password} onChangeText={setPassword} />
      </Reveal>
      <Reveal index={5}>
        <Checkbox label="Stay signed in on this device" checked={stayedSignedIn} onChange={setStayedSignedIn} />
      </Reveal>
      {error && <Text style={styles.error}>{error}</Text>}
      <Reveal index={6}>
        <Text style={styles.legalNotice}>
          By creating an account you agree to our{" "}
          <Text style={styles.legalLink} onPress={() => router.push("/legal/terms")}>Terms & Conditions</Text>
          {" "}and{" "}
          <Text style={styles.legalLink} onPress={() => router.push("/legal/privacy")}>Privacy Policy</Text>.
        </Text>
        <MorphButton label="Create account" busy={busy} onPress={submit} style={{ marginTop: space.md }} />
        <Pressable onPress={() => router.replace("/auth/login")} style={{ marginTop: space.lg }}>
          <Text style={styles.center}>Already have an account? <Text style={styles.linkStrong}>Sign in</Text></Text>
        </Pressable>
      </Reveal>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.heading, fontSize: 28, color: color.ink, marginBottom: space.lg },
  linkStrong: { fontFamily: font.body, fontSize: 14, color: color.clayDeep, fontWeight: "700" },
  center: { fontFamily: font.body, fontSize: 14, color: color.inkFaint, textAlign: "center" },
  error: { fontFamily: font.body, fontSize: 13, color: color.danger, marginTop: space.sm },
  legalNotice: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, textAlign: "center", lineHeight: 17, marginTop: space.sm },
  legalLink: { fontFamily: font.body, fontSize: 12, color: color.clayDeep, fontWeight: "600" },
});
