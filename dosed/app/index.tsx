import { useCallback, useState } from "react";
import { View, Text, SectionList, StyleSheet, Pressable } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { listPets, listActiveMedications, logsInRange, upsertDoseStatus } from "@/db/schema";
import { expandSchedule } from "@/lib/schedule";
import { runSync } from "@/lib/sync";
import { DoseRow } from "@/components/DoseRow";
import { EmptyState } from "@/components/EmptyState";
import { PixelDog } from "@/components/PixelArt";
import { color, font, space, radius } from "@/theme/tokens";
import type { Pet, Medication, DoseStatus } from "@/db/types";

interface Section {
  pet: Pet;
  data: { med: Medication; scheduledAt: string; status: DoseStatus | "upcoming" }[];
}

interface Summary {
  totalPets: number;
  dosesToday: number;
  dosesTaken: number;
}

export default function Today() {
  const router = useRouter();
  const [sections, setSections] = useState<Section[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalPets: 0, dosesToday: 0, dosesTaken: 0 });
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [pets, meds] = await Promise.all([listPets(), listActiveMedications()]);
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);
    const logs = await logsInRange(dayStart.toISOString(), dayEnd.toISOString());

    const byPet = new Map<string, Section>();
    for (const pet of pets) byPet.set(pet.id, { pet, data: [] });

    let dosesToday = 0;
    let dosesTaken = 0;
    for (const med of meds) {
      const section = byPet.get(med.petId);
      if (!section) continue;
      for (const dose of expandSchedule(med, dayStart, dayEnd)) {
        const log = logs.get(`${med.id}|${dose.scheduledAt}`);
        const status = log?.status ?? "upcoming";
        section.data.push({ med, scheduledAt: dose.scheduledAt, status });
        dosesToday += 1;
        if (status === "taken") dosesTaken += 1;
      }
    }

    const withDoses = [...byPet.values()]
      .filter((s) => s.data.length > 0)
      .map((s) => ({ ...s, data: s.data.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)) }));
    setSections(withDoses);
    setSummary({ totalPets: pets.length, dosesToday, dosesTaken });
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const mark = async (medicationId: string, scheduledAt: string, status: DoseStatus) => {
    await upsertDoseStatus(medicationId, scheduledAt, status);
    load();
    runSync().catch(() => {});
  };

  // Only worth showing once there's something to summarize — an empty
  // "0 of 0 pets" card on a brand-new account is noise, not a dashboard.
  const showSummary = loaded && summary.totalPets > 0;

  if (loaded && sections.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        {showSummary && <SummaryCard summary={summary} />}
        <EmptyState
          title="Nothing due today"
          body="Add a pet and a medication to start tracking doses."
          art={<PixelDog pixelSize={8} />}
        />
        <Pressable style={styles.fab} onPress={() => router.push("/pets")}>
          <Text style={styles.fabLabel}>Go to Pets →</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SectionList
      style={{ flex: 1, backgroundColor: color.paper }}
      contentContainerStyle={{ padding: space.lg }}
      sections={sections}
      keyExtractor={(item) => `${item.med.id}|${item.scheduledAt}`}
      ListHeaderComponent={showSummary ? <SummaryCard summary={summary} /> : null}
      renderSectionHeader={({ section }) => (
        <Pressable onPress={() => router.push(`/pets/${section.pet.id}`)}>
          <Text style={styles.petHeader}>{section.pet.name}</Text>
        </Pressable>
      )}
      renderItem={({ item }) => (
        <DoseRow
          medName={item.med.name}
          dosageLabel={`${item.med.dosageValue} ${item.med.dosageUnit}`}
          time={new Date(item.scheduledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          status={item.status}
          onMarkTaken={() => mark(item.med.id, item.scheduledAt, "taken")}
          onMarkSkipped={() => mark(item.med.id, item.scheduledAt, "skipped")}
        />
      )}
    />
  );
}

/**
 * A compact "how's today going" glance: pet count plus a taken/total ratio.
 * Deliberately just three numbers, not a chart — this is the first thing
 * on the screen, and it should answer "am I on track today" in one look,
 * not ask for a second one.
 */
function SummaryCard({ summary }: { summary: Summary }) {
  const remaining = summary.dosesToday - summary.dosesTaken;
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryStat}>
        <Text style={styles.summaryNumber}>{summary.totalPets}</Text>
        <Text style={styles.summaryLabel}>{summary.totalPets === 1 ? "pet" : "pets"}</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryStat}>
        <Text style={styles.summaryNumber}>{summary.dosesTaken}/{summary.dosesToday}</Text>
        <Text style={styles.summaryLabel}>doses today</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryStat}>
        <Text style={[styles.summaryNumber, remaining > 0 && styles.summaryNumberPending]}>{Math.max(remaining, 0)}</Text>
        <Text style={styles.summaryLabel}>remaining</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  petHeader: { fontFamily: font.heading, fontSize: 20, color: color.ink, marginTop: space.lg, marginBottom: space.sm },
  fab: { position: "absolute", bottom: space.xl, alignSelf: "center", backgroundColor: color.clay, paddingVertical: space.md, paddingHorizontal: space.lg, borderRadius: 999 },
  fabLabel: { fontFamily: font.body, color: color.paper, fontWeight: "700" },
  summaryCard: {
    flexDirection: "row", backgroundColor: color.paperRaised, borderRadius: radius.md,
    borderWidth: 1, borderColor: color.hairline, padding: space.lg, marginBottom: space.md,
  },
  summaryStat: { flex: 1, alignItems: "center" },
  summaryDivider: { width: 1, backgroundColor: color.hairline, marginHorizontal: space.sm },
  summaryNumber: { fontFamily: font.heading, fontSize: 22, color: color.ink },
  summaryNumberPending: { color: color.clayDeep },
  summaryLabel: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, marginTop: 2 },
});
