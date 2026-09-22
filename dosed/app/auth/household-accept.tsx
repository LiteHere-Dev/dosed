import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { isSignedIn, ApiClientError } from "@/lib/api";
import { acceptHouseholdInvite } from "@/lib/household";
import { Button } from "@/components/Button";
import { color, font, space } from "@/theme/tokens";

type Status = "checking" | "signed-out" | "ok" | "error";

export default function HouseholdAccept() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [petId, setPetId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return setStatus("error");
    (async () => {
      if (!(await isSignedIn())) {
        setStatus("signed-out");
        return;
      }
      try {
        const { petId } = await acceptHouseholdInvite(token);
        setPetId(petId);
        setStatus("ok");
      } catch (e) {
        const message =
          e instanceof ApiClientError && e.code === "invite_email_mismatch"
            ? "This invite was sent to a different email address than the one you're signed in with."
            : e instanceof ApiClientError && e.code === "invalid_or_expired_invite"
              ? "This invite link has expired or was already used."
              : null;
        setErrorMessage(message);
        setStatus("error");
      }
    })();
  }, [token]);

  return (
    <View style={styles.wrap}>
      {status === "checking" && <Text style={styles.title}>Checking invite…</Text>}
      {status === "signed-out" && (
        <>
          <Text style={styles.title}>Sign in to accept</Text>
          <Text style={styles.subtitle}>Sign in with the email address this invite was sent to, then open this link again from your email.</Text>
          <Button label="Sign in" onPress={() => router.replace("/auth/login")} style={{ marginTop: space.lg }} />
        </>
      )}
      {status === "ok" && (
        <>
          <Text style={styles.title}>You're in ✓</Text>
          <Text style={styles.subtitle}>You can now help track and log doses for this pet.</Text>
          <Button label="View pet" onPress={() => router.replace(petId ? `/pets/${petId}` : "/")} style={{ marginTop: space.lg }} />
        </>
      )}
      {status === "error" && (
        <>
          <Text style={styles.title}>Couldn't join</Text>
          <Text style={styles.subtitle}>{errorMessage ?? "This invite link may have expired or already been used."}</Text>
          <Button label="Continue" onPress={() => router.replace("/")} style={{ marginTop: space.lg }} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.paper, padding: space.xl, justifyContent: "center", alignItems: "center" },
  title: { fontFamily: font.heading, fontSize: 24, color: color.ink, textAlign: "center" },
  subtitle: { fontFamily: font.body, fontSize: 14, color: color.inkFaint, textAlign: "center", marginTop: space.sm },
});
