import { useCallback, useState } from "react";
import { View, Text, StyleSheet, Alert, ScrollView, TextInput } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { me, resendVerification, logout, logoutAllDevices, changePassword, getAuditLog, exportAccountData, deleteAccount, ApiClientError } from "@/lib/api";
import { resetDb } from "@/db/schema";
import { runSync } from "@/lib/sync";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
  data_exported: "Your data was exported",
  account_deleted: "Account deleted",
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
  const [exporting, setExporting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [confirmingDeleteWarning, setConfirmingDeleteWarning] = useState(false);

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

  // GDPR Art. 20 / CCPA right to know: write the export to a local file and
  // hand it straight to the system share sheet, rather than just displaying
  // it — a JSON blob on screen isn't something most people can actually do
  // anything with, but "share to Files / Drive / email it to myself" is.
  const exportData = async () => {
    setExporting(true);
    try {
      const data = await exportAccountData();
      const path = `${FileSystem.documentDirectory}dosed-data-export.json`;
      await FileSystem.writeAsStringAsync(path, JSON.stringify(data, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: "Your Dosed data" });
      } else {
        Alert.alert("Exported", `Saved to ${path}`);
      }
    } catch {
      Alert.alert("Couldn't export", "Check your connection and try again.");
    } finally {
      setExporting(false);
    }
  };

  // Step-up auth for the same reason as sign-out-all, but the stakes are
  // higher still: this is irreversible. The server wipes R2 photos and
  // the database row (which cascades to every table that references it)
  // before this ever returns — there's no "undo" screen after this call
  // succeeds, which is why the Alert below spells that out before we even
  // ask for the password.
  const submitDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      await resetDb();
      router.replace("/auth/login");
    } catch (err) {
      setDeleteError(err instanceof ApiClientError && err.code === "invalid_current_password" ? "Wrong password." : "Couldn't delete your account.");
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeletePrompt = () => setConfirmingDeleteWarning(true);

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

      <Button label="Sign out" variant="danger" onPress={() => setConfirmingSignOut(true)} style={{ marginTop: space.xl }} />

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
        <Text style={styles.label}>Your data</Text>
        <Text style={styles.helpText}>
          Download a copy of everything Dosed has stored for you, or permanently delete your account.
        </Text>
        <Button label={exporting ? "Preparing export…" : "Export my data"} variant="quiet" onPress={exportData} style={{ marginTop: space.sm }} />

        {confirmingDelete ? (
          <View style={{ marginTop: space.md }}>
            <Text style={styles.label}>Confirm your password to permanently delete your account</Text>
            <TextInput style={styles.input} placeholder="Password" placeholderTextColor={color.inkFaint} secureTextEntry value={deletePassword} onChangeText={setDeletePassword} />
            {deleteError && <Text style={styles.error}>{deleteError}</Text>}
            <Button label={deleting ? "Deleting…" : "Permanently delete my account"} variant="danger" onPress={submitDelete} />
          </View>
        ) : (
          <Button label="Delete account" variant="danger" onPress={confirmDeletePrompt} style={{ marginTop: space.sm }} />
        )}
      </View>

      <View style={{ marginTop: space.xl }}>
        <Text style={styles.label}>Legal</Text>
        <Button label="Privacy Policy" variant="quiet" onPress={() => router.push("/legal/privacy")} style={{ marginTop: space.sm }} />
        <Button label="Terms & Conditions" variant="quiet" onPress={() => router.push("/legal/terms")} style={{ marginTop: space.sm }} />
      </View>

      <ConfirmDialog
        visible={confirmingSignOut}
        title="Sign out?"
        message="This clears Dosed's data from this device. It stays safe on the server."
        confirmLabel="Sign out"
        destructive
        onConfirm={() => { setConfirmingSignOut(false); signOut(); }}
        onCancel={() => setConfirmingSignOut(false)}
      />

      <ConfirmDialog
        visible={confirmingDeleteWarning}
        title="Delete your account?"
        message="This permanently erases your pets, medications, dose history, and photos from our servers. This cannot be undone."
        confirmLabel="Continue"
        destructive
        onConfirm={() => { setConfirmingDeleteWarning(false); setConfirmingDelete(true); }}
        onCancel={() => setConfirmingDeleteWarning(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, textTransform: "uppercase" },
  value: { fontFamily: font.heading, fontSize: 17, color: color.ink, marginTop: 2 },
  helpText: { fontFamily: font.body, fontSize: 13, color: color.inkFaint, marginTop: space.xs, lineHeight: 19 },
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
