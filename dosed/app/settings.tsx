import { useCallback, useState } from "react";
import { View, Text, StyleSheet, Alert, ScrollView, TextInput } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { me, resendVerification, logout, logoutAllDevices, changePassword, getAuditLog, ApiClientError } from "@/lib/api";
import { resetDb } from "@/db/schema";
import { runSync } from "@/lib/sync";
import { Button } from "@/components/Button";
import { color, font, space, radius } from "@/theme/tokens";

const EVENT_LABEL: Record<string, string> = {
  register: "Account created",
  login_success: "Signed in",
  login_failed: "Failed sign-in attempt",
  account_locked: "Account temporarily locked (too many failed attempts)",
  refresh_reuse_detected: "Suspicious session activity detected — all devices signed out",
  password_changed: "Password changed",
  password_reset_requested: "Password reset requested",
  password_reset_completed: "Password reset completed",
  email_verified: "Email verified",
  logout_all_devices: "Signed out of all devices",
  session_revoked: "A session was signed out",
};

export default function Settings() {
  const router = useRouter();
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof me>> | null>(null);
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof getAuditLog>>["events"]>([]);
  const [syncing, setSyncing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmingSignOutAll, setConfirmingSignOutAll] = useState(false);
  const [signOutAllPassword, setSignOutAllPassword] = useState("");
  const [signOutAllError, setSignOutAllError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    me().then(setProfile).catch(() => {});
    getAuditLog().then((r) => setActivity(r.events.slice(0, 5))).catch(() => {});
  }, []));

  const syncNow = async () => {
    setSyncing(true);
    try {
      await runSync();
    } catch {
      Alert.alert("Couldn't sync", "Check your connection and try again.");
    } finally {
      setSyncing(false);
    }
  };

  const resend = async () => {
    const { alreadyVerified } = await resendVerification();
    Alert.alert(alreadyVerified ? "Already verified" : "Sent", alreadyVerified ? "Your email is already verified." : "Check your inbox for a verification link.");
  };

  const submitPasswordChange = async () => {
    setPasswordError(null);
    if (newPassword.length < 8) return setPasswordError("New password needs at least 8 characters.");
    try {
      await changePassword(currentPassword, newPassword);
      Alert.alert("Password changed", "You've been signed out of your other devices for safety.");
      setChangingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordError(err instanceof ApiClientError && err.code === "invalid_current_password" ? "Current password is wrong." : "Couldn't change your password.");
    }
  };

  const signOut = async () => {
    await logout();
    // Wipes the local DB too: this device's copy of the data is only a
    // cache of the account's data, and leaving it behind after sign-out
    // would let the next person who signs in on this device see it.
    await resetDb();
    router.replace("/auth/login");
  };

  // Step-up auth ("sudo mode"): a still-valid access token isn't proof
  // it's still you holding the phone. Signing out every device is high
  // enough blast-radius to ask for the password again, right now.
  const submitSignOutAll = async () => {
    setSignOutAllError(null);
    try {
      await logoutAllDevices(signOutAllPassword);
      await signOut();
    } catch (err) {
      setSignOutAllError(err instanceof ApiClientError && err.code === "invalid_current_password" ? "Wrong password." : "Couldn't sign out other devices.");
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.paper }} contentContainerStyle={{ padding: space.lg }}>
      {profile && (
        <View style={{ marginBottom: space.xl }}>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.value}>{profile.username} · {profile.email}</Text>
          {!profile.emailVerifiedAt && (
            <Button label="Resend verification email" variant="quiet" onPress={resend} style={{ marginTop: space.sm }} />
          )}
        </View>
      )}

      <Button label={syncing ? "Syncing…" : "Sync now"} onPress={syncNow} variant="quiet" />

      {changingPassword ? (
        <View style={{ marginTop: space.lg }}>
          <TextInput style={styles.input} placeholder="Current password" placeholderTextColor={color.inkFaint} secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
          <TextInput style={styles.input} placeholder="New password" placeholderTextColor={color.inkFaint} secureTextEntry value={newPassword} onChangeText={setNewPassword} />
          {passwordError && <Text style={styles.error}>{passwordError}</Text>}
          <Button label="Save new password" onPress={submitPasswordChange} />
        </View>
      ) : (
        <Button label="Change password" variant="quiet" onPress={() => setChangingPassword(true)} style={{ marginTop: space.md }} />
      )}

      {activity.length > 0 && (
        <View style={{ marginTop: space.xl }}>
          <Text style={styles.label}>Recent activity</Text>
          {activity.map((e, i) => (
            <View key={i} style={styles.activityRow}>
              <Text style={styles.activityText}>{EVENT_LABEL[e.eventType] ?? e.eventType}</Text>
              <Text style={styles.activityMeta}>
                {new Date(e.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {e.ipAddress ? ` · ${e.ipAddress}` : ""}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Button label="Sign out" variant="danger" onPress={() => Alert.alert("Sign out?", "This clears Dosed's data from this device (it stays safe on the server).", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: signOut },
      ])} style={{ marginTop: space.xl }} />

      {confirmingSignOutAll ? (
        <View style={{ marginTop: space.md }}>
          <Text style={styles.label}>Confirm your password to sign out every device</Text>
          <TextInput style={styles.input} placeholder="Password" placeholderTextColor={color.inkFaint} secureTextEntry value={signOutAllPassword} onChangeText={setSignOutAllPassword} />
          {signOutAllError && <Text style={styles.error}>{signOutAllError}</Text>}
          <Button label="Sign out everywhere" variant="danger" onPress={submitSignOutAll} />
        </View>
      ) : (
        <Button label="Sign out of all devices" variant="quiet" onPress={() => setConfirmingSignOutAll(true)} style={{ marginTop: space.sm }} />
      )}

      <View style={{ marginTop: space.xl }}>
        <Text style={styles.label}>Legal</Text>
        <Button label="Privacy Policy" variant="quiet" onPress={() => router.push("/legal/privacy")} style={{ marginTop: space.sm }} />
        <Button label="Terms & Conditions" variant="quiet" onPress={() => router.push("/legal/terms")} style={{ marginTop: space.sm }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, textTransform: "uppercase" },
  value: { fontFamily: font.heading, fontSize: 17, color: color.ink, marginTop: 2 },
  input: {
    fontFamily: font.body, fontSize: 16, color: color.ink,
    backgroundColor: color.paperRaised, borderRadius: radius.sm,
    borderWidth: 1, borderColor: color.hairline,
    paddingHorizontal: space.md, paddingVertical: space.sm, marginBottom: space.md,
  },
  error: { fontFamily: font.body, fontSize: 13, color: color.danger, marginBottom: space.sm },
  activityRow: { paddingVertical: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  activityText: { fontFamily: font.body, fontSize: 14, color: color.ink },
  activityMeta: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, marginTop: 1 },
});
