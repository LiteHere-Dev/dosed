import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { monthStatsForPet, type MonthStats } from "@/lib/stats";
import { color, font, space, radius } from "@/theme/tokens";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * A month-at-a-glance adherence heatmap for one pet: darker cells mean a
 * higher fraction of that day's doses were given, plus the month's overall
 * completion percentage and a "consecutive fully-adherent days" streak.
 * Complements the 7-day bar chart on the dashboard (see app/index.tsx
 * WeekCard) with a longer view for spotting patterns before a vet visit.
 */
export function AdherenceCalendar({ petId }: { petId: string }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [stats, setStats] = useState<MonthStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    monthStatsForPet(petId, cursor.getFullYear(), cursor.getMonth()).then((s) => { if (!cancelled) setStats(s); });
    return () => { cancelled = true; };
  }, [petId, cursor]);

  const monthLabel = cursor.toLocaleDateString([], { month: "long", year: "numeric" });
  const shiftMonth = (delta: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={8}><Feather name="chevron-left" size={18} color={color.inkFaint} /></Pressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={8}><Feather name="chevron-right" size={18} color={color.inkFaint} /></Pressable>
      </View>

      {stats && (
        <View style={styles.statsRow}>
          <Text style={styles.statText}>{stats.completionPct != null ? `${stats.completionPct}% on schedule` : "Nothing scheduled"}</Text>
          {stats.streak > 0 && <Text style={styles.streakText}>{stats.streak}-day streak</Text>}
        </View>
      )}

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((w, i) => <Text key={i} style={styles.weekdayLabel}>{w}</Text>)}
      </View>
      <View style={styles.grid}>
        {(stats?.cells ?? []).map((cell) => {
          const pct = cell.scheduled > 0 ? cell.taken / cell.scheduled : null;
          return (
            <View key={cell.date} style={styles.cellWrap}>
              <View style={[styles.cell, cellStyle(pct, cell.inMonth, cell.isFuture)]}>
                <Text style={[styles.cellDay, !cell.inMonth && { color: color.hairline }]}>{Number(cell.date.slice(-2))}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function cellStyle(pct: number | null, inMonth: boolean, isFuture: boolean) {
  if (!inMonth || isFuture || pct === null) return { backgroundColor: "transparent" };
  if (pct >= 1) return { backgroundColor: color.moss };
  if (pct >= 0.5) return { backgroundColor: color.mossFaint };
  if (pct > 0) return { backgroundColor: "#F3E6C8" };
  return { backgroundColor: color.hairline };
}

const CELL_SIZE = 34;

const styles = StyleSheet.create({
  card: { backgroundColor: color.paperRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: color.hairline, padding: space.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.lg, marginBottom: space.sm },
  monthLabel: { fontFamily: font.heading, fontSize: 16, color: color.ink, minWidth: 140, textAlign: "center" },
  statsRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space.sm, marginBottom: space.md },
  statText: { fontFamily: font.body, fontSize: 12, color: color.inkFaint },
  streakText: { fontFamily: font.body, fontSize: 12, fontWeight: "700", color: color.amber },
  weekdayRow: { flexDirection: "row" },
  weekdayLabel: { width: CELL_SIZE, textAlign: "center", fontFamily: font.body, fontSize: 11, color: color.inkFaint },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cellWrap: { width: CELL_SIZE, height: CELL_SIZE, alignItems: "center", justifyContent: "center" },
  cell: { width: CELL_SIZE - 6, height: CELL_SIZE - 6, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cellDay: { fontFamily: font.body, fontSize: 11, color: color.ink },
});
