import { useCallback, useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { inviteCaregiver, listMembers, removeMember } from "@/lib/household";
import { ApiClientError } from "@/lib/api";
import { Button } from "@/components/Button";
import { color, font, space, radius } from "@/theme/tokens";

interface Member { id: string; invitedEmail: string; role: string; status: string; createdAt: string; acceptedAt: string | null }

export default function SharePet() {
  const { petId, petName } = useLocalSearchParams<{ petId: string; petName?: string }>();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { members } = await listMembers(petId);
      setMembers(members);
    } catch {
      // offline or not the owner — leave the list empty rather than erroring the whole screen
    }
  }, [petId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const validEmail = /\S+@\S+\.\S+/.test(email.trim());

  const invite = async () => {
    if (!validEmail || inviting) return;
    setInviting(true);
    setError(null);
    try {
      await inviteCaregiver(petId, email.trim().toLowerCase());
      setEmail("");
      load();
    } catch (e) {
      setError(e instanceof ApiClientError && e.code === "invite_already_pending" ? "There's already a pending invite for that email." : "Couldn't send the invite. Check your connection and try again.");
    } finally {
      setInviting(false);
    }
  };

  const revoke = (member: Member) => {
    Alert.alert("Remove access?", `${member.invitedEmail} will no longer be able to see or log doses for ${petName ?? "this pet"}.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => { await removeMember(petId, member.id); load(); } },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.paper }} contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        Invite a family member or co-owner to help care for {petName ?? "this pet"}. They'll be able to see the schedule and log doses — so nobody accidentally double-doses — but not edit the pet profile or medication schedule.
      </Text>

      <View style={styles.inviteRow}>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="their-email@example.com"
          placeholderTextColor={color.inkFaint}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Pressable onPress={invite} style={[styles.inviteButton, (!validEmail || inviting) && { opacity: 0.5 }]} disabled={!validEmail || inviting}>
          <Feather name="send" size={16} color={color.paper} />
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>Caregivers</Text>
      {members.length === 0 ? (
        <Text style={styles.empty}>No one else has been invited yet.</Text>
      ) : (
        members.map((m) => (
          <View key={m.id} style={styles.memberRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberEmail}>{m.invitedEmail}</Text>
              <Text style={styles.memberStatus}>{m.status === "accepted" ? "Active" : "Invite pending"}</Text>
            </View>
            <Pressable onPress={() => revoke(m)} hitSlop={8}>
              <Feather name="x" size={18} color={color.inkFaint} />
            </Pressable>
          </View>
        ))
      )}

      <Button label="Done" onPress={() => router.back()} style={{ marginTop: space.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  intro: { fontFamily: font.body, fontSize: 14, color: color.inkFaint, marginBottom: space.lg, lineHeight: 20 },
  inviteRow: { flexDirection: "row", gap: space.sm },
  input: {
    flex: 1, fontFamily: font.body, fontSize: 16, color: color.ink,
    backgroundColor: color.paperRaised, borderRadius: radius.sm,
    borderWidth: 1, borderColor: color.hairline, paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  inviteButton: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: color.clay, alignItems: "center", justifyContent: "center" },
  error: { fontFamily: font.body, fontSize: 12, color: color.danger, marginTop: space.sm },
  sectionTitle: { fontFamily: font.heading, fontSize: 16, color: color.ink, marginTop: space.xl, marginBottom: space.sm },
  empty: { fontFamily: font.body, fontSize: 13, color: color.inkFaint },
  memberRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline,
  },
  memberEmail: { fontFamily: font.body, fontSize: 14, color: color.ink },
  memberStatus: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, marginTop: 2 },
});
