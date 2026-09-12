import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "@/components/Button";
import { color, font, space } from "@/theme/tokens";

type Status = "checking" | "ok" | "error";

export default function VerifyEmail() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    if (!token) return setStatus("error");
    (async () => {
      const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
      try {
        const res = await fetch(`${API_URL}/api/account/verify-email`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }),
        });
        setStatus(res.ok ? "ok" : "error");
      } catch {
        setStatus("error");
      }
    })();
  }, [token]);

  return (
    <View style={styles.wrap}>
      {status === "checking" && <Text style={styles.title}>Verifying…</Text>}
      {status === "ok" && <Text style={styles.title}>Email verified ✓</Text>}
      {status === "error" && (
        <>
          <Text style={styles.title}>Couldn't verify</Text>
          <Text style={styles.subtitle}>This link may have expired. You can request a new one from Settings once signed in.</Text>
        </>
      )}
      <Button label="Continue" onPress={() => router.replace("/")} style={{ marginTop: space.lg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.paper, padding: space.xl, justifyContent: "center", alignItems: "center" },
  title: { fontFamily: font.heading, fontSize: 24, color: color.ink, textAlign: "center" },
  subtitle: { fontFamily: font.body, fontSize: 14, color: color.inkFaint, textAlign: "center", marginTop: space.sm },
});
