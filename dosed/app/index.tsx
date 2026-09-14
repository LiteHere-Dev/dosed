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

interface DayStat { label: string; scheduled: number; taken: number; isToday: boolean }
interface PetStat { pet: Pet; scheduled: number; taken: number }
interface Dashboard { week: DayStat[]; streak: number; perPet: PetStat[] }

const EMPTY_DASHBOARD: Dashboard = { week: [], streak: 0, perPet: [] };

const todayLabel = () =>
  new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

export default function Today() {
  const router = useRouter();
  const [pets, setPets] = useState<Pet[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalPets: 0, dosesToday: 0, dosesTaken: 0 });
  const [dashboard, setDashboard] = useState<Dashboard>(EMPTY_DASHBOARD);
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
    setDashboard(await computeDashboard(petList, meds));
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const mark = async (medicationId: string, scheduledAt: string, status: DoseStatus) => {
    await upsertDoseStatus(medicationId, scheduledAt, status);
    load();
    runSync().catch(() => {});
  };

  // Always show the dashboard shell, even for a brand-new account with
  // nothing in it yet — a fresh install with zeroed-out cards reads as
  // "here's what you'll be tracking" rather than a blank screen, and
  // costs nothing to render (every stat below already defaults to 0/empty).
  const showGlance = loaded;

  if (loaded && sections.length === 0) {
    const hasPets = summary.totalPets > 0;
    return (
      <View style={{ flex: 1, backgroundColor: color.paper }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
          <Text style={styles.dateLabel}>{todayLabel()}</Text>
          <GlanceCard summary={summary} streak={dashboard.streak} />
          <WeekCard dashboard={dashboard} />
          {pets.length > 1 && <PetStrip pets={pets} onSelect={(id) => router.push(`/pets/${id}`)} />}
          <EmptyState
            title={hasPets ? "Nothing due today" : "No pets yet"}
            body={
              hasPets
                ? "Every active medication is scheduled or already given — check back when the next dose is due."
                : "Add a pet and a medication to start tracking doses."
            }
            art={<BreathingArt />}
          />
        </ScrollView>
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
            <GlanceCard summary={summary} streak={dashboard.streak} />
            <WeekCard dashboard={dashboard} />
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
 * Real 7-day adherence, computed from the actual schedule + actual logs —
 * not a mock. For each of the last 7 days (today included), expands every
 * active medication's schedule for that day and counts how many of those
 * instances have a "taken" log. Also derives a streak: consecutive days,
 * walking back from today, where every scheduled dose was taken. A day
 * with nothing scheduled doesn't break the streak (there was nothing to
 * miss); today doesn't break it either while it's still in progress.
 */
async function computeDashboard(petList: Pet[], meds: Medication[]): Promise<Dashboard> {
  const days: { start: Date; end: Date; label: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - i);
    const end = new Date(start); end.setHours(23, 59, 59, 999);
    days.push({ start, end, label: start.toLocaleDateString([], { weekday: "narrow" }) });
  }

  const weekLogs = await logsInRange(days[0].start.toISOString(), days[6].end.toISOString());

  const week: DayStat[] = days.map((d, i) => ({ label: d.label, scheduled: 0, taken: 0, isToday: i === 6 }));
  const petTotals = new Map<string, PetStat>(petList.map((pet) => [pet.id, { pet, scheduled: 0, taken: 0 }]));

  for (const med of meds) {
    const petStat = petTotals.get(med.petId);
    for (let i = 0; i < days.length; i++) {
      for (const dose of expandSchedule(med, days[i].start, days[i].end)) {
        week[i].scheduled += 1;
        if (petStat) petStat.scheduled += 1;
        if (weekLogs.get(`${med.id}|${dose.scheduledAt}`)?.status === "taken") {
          week[i].taken += 1;
          if (petStat) petStat.taken += 1;
        }
      }
    }
  }

  let streak = 0;
  for (let i = week.length - 1; i >= 0; i--) {
    const { scheduled, taken, isToday } = week[i];
    if (scheduled === 0) continue; // nothing due that day — doesn't help or hurt the streak
    if (taken === scheduled) { streak += 1; continue; }
    if (isToday) continue; // today isn't over yet, don't count it as a miss
    break; // a past day with a real miss ends the streak
  }

  return { week, streak, perPet: [...petTotals.values()].filter((p) => p.scheduled > 0) };
}

/**
 * The first thing on the screen: a fill bar answers "am I on track today"
 * at a glance, with the pet count and streak as supporting facts rather
 * than equal-weight tiles. Fills in once on load — the one entrance
 * animation on this screen — rather than every re-render, so marking a
 * dose doesn't replay it.
 */
function GlanceCard({ summary, streak }: { summary: Summary; streak: number }) {
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
        <View style={styles.pillStack}>
          <View style={[styles.remainingPill, allDone && styles.remainingPillDone]}>
            <Text style={[styles.remainingPillText, allDone && styles.remainingPillTextDone]}>
              {summary.dosesToday === 0 ? "Nothing scheduled" : allDone ? "All done" : `${remaining} left`}
            </Text>
          </View>
          {streak > 0 && (
            <View style={styles.streakPill}>
              <Text style={styles.streakPillText}>{streak}-day streak</Text>
            </View>
          )}
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

/**
 * A real weekly chart: 7 bars, one per day, height = that day's adherence
 * percentage from actual logged doses. Plus a per-pet breakdown underneath
 * when more than one pet has anything scheduled this week, so multi-pet
 * households can see who's falling behind, not just a household-wide
 * average.
 */
function WeekCard({ dashboard }: { dashboard: Dashboard }) {
  if (dashboard.week.length === 0) return null;
  const totalScheduled = dashboard.week.reduce((sum, d) => sum + d.scheduled, 0);
  const totalTaken = dashboard.week.reduce((sum, d) => sum + d.taken, 0);
  const weekPct = totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : null;

  return (
    <View style={styles.weekCard}>
      <View style={styles.weekHeaderRow}>
        <Text style={styles.weekTitle}>This week</Text>
        {weekPct !== null && <Text style={styles.weekPct}>{weekPct}% on schedule</Text>}
      </View>
      <View style={styles.barsRow}>
        {dashboard.week.map((d, i) => (
          <DayBar key={i} day={d} />
        ))}
      </View>
      {dashboard.perPet.length > 1 && (
        <View style={styles.perPetList}>
          {dashboard.perPet.map(({ pet, scheduled, taken }) => {
            const pct = scheduled > 0 ? Math.round((taken / scheduled) * 100) : 0;
            return (
              <View key={pet.id} style={styles.perPetRow}>
                <PetAvatar name={pet.name} species={pet.species} size={22} />
                <Text style={styles.perPetName} numberOfLines={1}>{pet.name}</Text>
                <View style={styles.perPetTrack}>
                  <View style={[styles.perPetFill, { width: `${pct}%` }, pct === 100 && styles.fillDone]} />
                </View>
                <Text style={styles.perPetPct}>{pct}%</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function DayBar({ day }: { day: DayStat }) {
  const pct = day.scheduled > 0 ? (day.taken / day.scheduled) * 100 : 0;
  const height = useSharedValue(0);
  useEffect(() => {
    height.value = withTiming(day.scheduled > 0 ? Math.max(pct, 6) : 0, { duration: 450, easing: motion.easeOut });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct, day.scheduled]);
  const barStyle = useAnimatedStyle(() => ({ height: `${height.value}%` }));

  return (
    <View style={styles.dayColumn}>
      <View style={styles.dayTrack}>
        {day.scheduled > 0 ? (
          <Animated.View style={[styles.dayFill, barStyle, pct === 100 && styles.fillDone]} />
        ) : (
          <View style={styles.dayEmptyDot} />
        )}
      </View>
      <Text style={[styles.dayLabel, day.isToday && styles.dayLabelToday]}>{day.label}</Text>
    </View>
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
  pillStack: { alignItems: "flex-end", gap: space.xs },
  remainingPill: { backgroundColor: color.mossFaint, paddingVertical: 6, paddingHorizontal: space.md, borderRadius: 999 },
  remainingPillDone: { backgroundColor: color.mossFaint },
  remainingPillText: { fontFamily: font.body, fontSize: 13, fontWeight: "700", color: color.clayDeep },
  remainingPillTextDone: { color: color.moss },
  streakPill: { backgroundColor: "#F3E6C8", paddingVertical: 4, paddingHorizontal: space.sm, borderRadius: 999 },
  streakPillText: { fontFamily: font.body, fontSize: 11, fontWeight: "700", color: color.amber },
  track: { height: 8, borderRadius: 4, backgroundColor: color.hairline, marginTop: space.lg, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: color.clay },
  fillDone: { backgroundColor: color.moss },
  glanceFooter: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, marginTop: space.sm },

  weekCard: {
    backgroundColor: color.paperRaised, borderRadius: radius.lg,
    borderWidth: 1, borderColor: color.hairline, padding: space.lg, marginBottom: space.md,
  },
  weekHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: space.md },
  weekTitle: { fontFamily: font.heading, fontSize: 17, color: color.ink },
  weekPct: { fontFamily: font.body, fontSize: 13, color: color.inkFaint },
  barsRow: { flexDirection: "row", justifyContent: "space-between", height: 88, alignItems: "flex-end" },
  dayColumn: { alignItems: "center", flex: 1 },
  dayTrack: { width: 16, height: 64, borderRadius: 8, backgroundColor: color.hairline, justifyContent: "flex-end", overflow: "hidden" },
  dayFill: { width: "100%", borderRadius: 8, backgroundColor: color.clay },
  dayEmptyDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: color.hairline, alignSelf: "center", marginBottom: 4 },
  dayLabel: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, marginTop: space.xs },
  dayLabelToday: { color: color.clayDeep, fontWeight: "700" },

  perPetList: { marginTop: space.lg, gap: space.sm },
  perPetRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  perPetName: { fontFamily: font.body, fontSize: 13, color: color.ink, width: 64 },
  perPetTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: color.hairline, overflow: "hidden" },
  perPetFill: { height: "100%", borderRadius: 3, backgroundColor: color.clay },
  perPetPct: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, width: 34, textAlign: "right" },

  strip: { marginBottom: space.md },
  stripContent: { gap: space.lg, paddingVertical: space.xs },
  stripItem: { alignItems: "center", width: 56 },
  stripLabel: { fontFamily: font.body, fontSize: 12, color: color.ink, marginTop: space.xs },
});
