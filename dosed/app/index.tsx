import { useCallback, useEffect, useState } from "react";
import { View, Text, SectionList, ScrollView, StyleSheet, Pressable, AccessibilityInfo } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { listPets, listActiveMedications, logsInRange, upsertDoseStatus } from "@/db/schema";
import { expandSchedule } from "@/lib/schedule";
import { runSync } from "@/lib/sync";
import { DoseRow } from "@/components/DoseRow";
import { EmptyState } from "@/components/EmptyState";
import { PixelDog, PetAvatar } from "@/components/PixelArt";
import { Button } from "@/components/Button";
import { color, font, space, radius, motion } from "@/theme/tokens";
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

const todayLabel = () =>
  new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

export default function Today() {
  const router = useRouter();
  const [pets, setPets] = useState<Pet[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalPets: 0, dosesToday: 0, dosesTaken: 0 });
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [petList, meds] = await Promise.all([listPets(), listActiveMedications()]);
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);
    const logs = await logsInRange(dayStart.toISOString(), dayEnd.toISOString());

    const byPet = new Map<string, Section>();
    for (const pet of petList) byPet.set(pet.id, { pet, data: [] });

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
    setPets(petList);
    setSections(withDoses);
    setSummary({ totalPets: petList.length, dosesToday, dosesTaken });
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const mark = async (medicationId: string, scheduledAt: string, status: DoseStatus) => {
    await upsertDoseStatus(medicationId, scheduledAt, status);
    load();
    runSync().catch(() => {});
  };

  // A card summarizing 0 pets and 0 doses is noise on a brand-new account —
  // it only earns its place once there's something to actually summarize.
  const showGlance = loaded && summary.totalPets > 0;

  if (loaded && sections.length === 0) {
    const hasPets = summary.totalPets > 0;
    return (
      <View style={{ flex: 1, backgroundColor: color.paper }}>
        {hasPets && pets.length > 0 && <PetStrip pets={pets} onSelect={(id) => router.push(`/pets/${id}`)} />}
        <EmptyState
          title={hasPets ? "Nothing due today" : "No pets yet"}
          body={
            hasPets
              ? "Every active medication is scheduled or already given — check back when the next dose is due."
              : "Add a pet and a medication to start tracking doses."
          }
          art={<BreathingArt />}
        />
        <Button
          label={hasPets ? "Go to pets →" : "Add your first pet →"}
          onPress={() => router.push("/pets")}
          style={styles.fab}
        />
      </View>
    );
  }

  return (
    <SectionList
      style={{ flex: 1, backgroundColor: color.paper }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
      sections={sections}
      keyExtractor={(item) => `${item.med.id}|${item.scheduledAt}`}
      ListHeaderComponent={
        showGlance ? (
          <>
            <Text style={styles.dateLabel}>{todayLabel()}</Text>
            <GlanceCard summary={summary} />
            {pets.length > 1 && <PetStrip pets={pets} onSelect={(id) => router.push(`/pets/${id}`)} />}
          </>
        ) : null
      }
      renderSectionHeader={({ section }) => (
        <Pressable style={styles.petHeaderRow} onPress={() => router.push(`/pets/${section.pet.id}`)}>
          <PetAvatar name={section.pet.name} species={section.pet.species} size={28} />
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
 * The first thing on the screen: a fill bar answers "am I on track today"
 * at a glance, with the pet count and remaining-dose count as supporting
 * numbers rather than three equal-weight tiles. Fills in once on load —
 * the one entrance animation on this screen, per the "spend motion once"
 * rule — rather than every re-render, so marking a dose doesn't replay it.
 */
function GlanceCard({ summary }: { summary: Summary }) {
  const remaining = Math.max(summary.dosesToday - summary.dosesTaken, 0);
  const pct = summary.dosesToday > 0 ? (summary.dosesTaken / summary.dosesToday) * 100 : 0;
  const allDone = summary.dosesToday > 0 && remaining === 0;

  const progress = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const cardRise = useSharedValue(8);
  useEffect(() => {
    progress.value = withTiming(pct, { duration: 500, easing: motion.easeOut });
    cardOpacity.value = withTiming(1, { duration: motion.durationEnter, easing: motion.easeOut });
    cardRise.value = withTiming(0, { duration: motion.durationEnter, easing: motion.easeOut });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value}%` }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: cardOpacity.value, transform: [{ translateY: cardRise.value }] }));

  return (
    <Animated.View style={[styles.glanceCard, cardStyle]}>
      <View style={styles.glanceTop}>
        <View>
          <Text style={styles.glanceCount}>
            {summary.dosesTaken}
            <Text style={styles.glanceCountTotal}> / {summary.dosesToday}</Text>
          </Text>
          <Text style={styles.glanceLabel}>doses given today</Text>
        </View>
        <View style={[styles.remainingPill, allDone && styles.remainingPillDone]}>
          <Text style={[styles.remainingPillText, allDone && styles.remainingPillTextDone]}>
            {allDone ? "All done" : `${remaining} left`}
          </Text>
        </View>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, barStyle, allDone && styles.fillDone]} />
      </View>
      <Text style={styles.glanceFooter}>
        across {summary.totalPets} {summary.totalPets === 1 ? "pet" : "pets"}
      </Text>
    </Animated.View>
  );
}

/** Horizontal quick-nav to jump straight to a pet without scrolling sections. */
function PetStrip({ pets, onSelect }: { pets: Pet[]; onSelect: (id: string) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.stripContent}
      style={styles.strip}
    >
      {pets.map((pet) => (
        <Pressable key={pet.id} style={styles.stripItem} onPress={() => onSelect(pet.id)}>
          <PetAvatar name={pet.name} species={pet.species} size={48} />
          <Text style={styles.stripLabel} numberOfLines={1}>{pet.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Idle breathing scale on the empty-state mascot — the single non-user-
 * triggered motion on this screen, and skipped entirely if the system
 * prefers reduced motion. */
function BreathingArt() {
  const scale = useSharedValue(1);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) return;
      scale.value = withRepeat(
        withSequence(
          withTiming(1.035, { duration: 900, easing: motion.easeOut }),
          withTiming(1, { duration: 900, easing: motion.easeIn })
        ),
        -1,
        false
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <PixelDog pixelSize={8} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dateLabel: { fontFamily: font.body, fontSize: 13, color: color.inkFaint, marginBottom: space.sm },
  petHeaderRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.lg, marginBottom: space.sm },
  petHeader: { fontFamily: font.heading, fontSize: 20, color: color.ink },
  fab: { position: "absolute", bottom: space.xl, alignSelf: "center", paddingHorizontal: space.xl, borderRadius: 999 },

  glanceCard: {
    backgroundColor: color.paperRaised, borderRadius: radius.lg,
    borderWidth: 1, borderColor: color.hairline, padding: space.lg, marginBottom: space.md,
  },
  glanceTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  glanceCount: { fontFamily: font.heading, fontSize: 34, color: color.ink },
  glanceCountTotal: { fontSize: 20, color: color.inkFaint },
  glanceLabel: { fontFamily: font.body, fontSize: 13, color: color.inkFaint, marginTop: 2 },
  remainingPill: { backgroundColor: color.mossFaint, paddingVertical: 6, paddingHorizontal: space.md, borderRadius: 999 },
  remainingPillDone: { backgroundColor: color.mossFaint },
  remainingPillText: { fontFamily: font.body, fontSize: 13, fontWeight: "700", color: color.clayDeep },
  remainingPillTextDone: { color: color.moss },
  track: { height: 8, borderRadius: 4, backgroundColor: color.hairline, marginTop: space.lg, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: color.clay },
  fillDone: { backgroundColor: color.moss },
  glanceFooter: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, marginTop: space.sm },

  strip: { marginBottom: space.md },
  stripContent: { gap: space.lg, paddingVertical: space.xs },
  stripItem: { alignItems: "center", width: 56 },
  stripLabel: { fontFamily: font.body, fontSize: 12, color: color.ink, marginTop: space.xs },
});
