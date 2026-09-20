import { useState } from "react";
import { Text, StyleSheet, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { login, ApiClientError } from "@/lib/api";
import { runSync } from "@/lib/sync";
import { Checkbox } from "@/components/Checkbox";
import { AuthShell, AuthField, MorphButton, Reveal, sleep } from "@/components/AuthShell";
import { color, font, space } from "@/theme/tokens";

export default function Login() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [stayedSignedIn, setStayedSignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [curtain, setCurtain] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await login(identifier.trim(), password, stayedSignedIn);
      await runSync();
      // Fade to dark first so the jump into the app feels like a hand-off,
      // not a hard cut.
      setCurtain(true);
      await sleep(360);
      router.replace("/");
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiClientError && err.code === "account_locked") {
        setError("Too many failed attempts. Try again in a few minutes.");
      } else {
        setError("Wrong email/username or password.");
      }
    }
  };

  return (
    <AuthShell tagline="Welcome back. Sign in to continue." curtain={curtain}>
      <Reveal index={0}>
        <Text style={styles.title}>Sign in</Text>
      </Reveal>
      <Reveal index={1}>
        <AuthField label="Email or username" placeholder="you@example.com" autoCapitalize="none" autoCorrect={false} value={identifier} onChangeText={setIdentifier} />
      </Reveal>
      <Reveal index={2}>
        <AuthField label="Password" placeholder="Your password" secure value={password} onChangeText={setPassword} />
      </Reveal>
      <Reveal index={3}>
        <View style={styles.row}>
          <Checkbox label="Stay signed in" checked={stayedSignedIn} onChange={setStayedSignedIn} />
          <Pressable onPress={() => router.push("/auth/forgot-password")} hitSlop={8}>
            <Text style={styles.link}>Forgot password?</Text>
          </Pressable>
        </View>
      </Reveal>
      {error && <Text style={styles.error}>{error}</Text>}
      <Reveal index={4}>
        <MorphButton label="Sign in" busy={busy} onPress={submit} style={{ marginTop: space.md }} />
      </Reveal>
      <Reveal index={5}>
        <Pressable onPress={() => router.push("/auth/register")} style={{ marginTop: space.lg }}>
          <Text style={styles.center}>New here? <Text style={styles.linkStrong}>Create an account</Text></Text>
        </Pressable>
        <Text style={styles.legalNotice}>
          <Text style={styles.legalLink} onPress={() => router.push("/legal/terms")}>Terms & Conditions</Text>
          {"  •  "}
          <Text style={styles.legalLink} onPress={() => router.push("/legal/privacy")}>Privacy Policy</Text>
        </Text>
      </Reveal>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.heading, fontSize: 28, color: color.ink, marginBottom: space.lg },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  link: { fontFamily: font.body, fontSize: 13, color: color.clayDeep },
  linkStrong: { fontFamily: font.body, fontSize: 14, color: color.clayDeep, fontWeight: "700" },
  center: { fontFamily: font.body, fontSize: 14, color: color.inkFaint, textAlign: "center" },
  error: { fontFamily: font.body, fontSize: 13, color: color.danger, marginTop: space.sm },
  legalNotice: { textAlign: "center", marginTop: space.xl },
  legalLink: { fontFamily: font.body, fontSize: 12, color: color.inkFaint },
});
