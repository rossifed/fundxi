// MatchView — fixture detail (pushed screen). RN port of
// apps/web/src/ui/pages/match/MatchView.tsx, adapted to a single scrollable
// column: score header + scorers, match stats, commentary, and the lineups
// (home/away grouped by position, with goal/card badges + live price). The
// desktop tactical PitchView and the marquee ticker are deferred — the List
// lineup carries the same data. Live via the fixture/{id} + prices topics.

import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { comments_api } from "@fundxi/core/api/comments_api";
import { matches_api } from "@fundxi/core/api/matches_api";
import { players_api } from "@fundxi/core/api/players_api";
import { team_stats_api } from "@fundxi/core/api/team_stats_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import type { Match, MatchEvent, MatchPlayer } from "@fundxi/core/domain/match/match";
import type { MatchComment } from "@fundxi/core/domain/match/match_comment";
import type { TeamMatchStats } from "@fundxi/core/domain/match/team_match_stats";
import type { Player, Position } from "@fundxi/core/domain/player/player";

import { PlayerSheet, type PlayerSheetHandle } from "@/components/PlayerSheet";
import { TickValue } from "@/components/TickValue";
import { useFixtureLiveVersion, useLiveRefetch, usePricesLiveVersion } from "@/components/live";
import { color_for_sign, fmt_signed_pct } from "@/lib/format";
import { mono, palette, text } from "@/theme/tokens";

const GOAL_GLYPHS = new Set(["⚽", "🎯"]);
const POSITION_GROUPS: { key: Position; label: string }[] = [
  { key: "GK", label: "Goalkeeper" },
  { key: "DF", label: "Defenders" },
  { key: "MF", label: "Midfielders" },
  { key: "FW", label: "Forwards" },
];

const STAT_ROWS: { code: string; label: string; pct?: boolean }[] = [
  { code: "ball-possession", label: "Possession", pct: true },
  { code: "shots-total", label: "Shots" },
  { code: "shots-on-target", label: "On target" },
  { code: "corners", label: "Corners" },
  { code: "fouls", label: "Fouls" },
  { code: "yellowcards", label: "Yellow cards" },
  { code: "passes", label: "Passes" },
  { code: "successful-passes-percentage", label: "Pass accuracy", pct: true },
  { code: "dangerous-attacks", label: "Dangerous attacks" },
];

interface EventCounts {
  goals: number;
  yellow: number;
  red: number;
}
function count_events(events: MatchEvent[]): Map<number, EventCounts> {
  const map = new Map<number, EventCounts>();
  const bump = (id: number, k: keyof EventCounts) => {
    const c = map.get(id) ?? { goals: 0, yellow: 0, red: 0 };
    c[k] += 1;
    map.set(id, c);
  };
  for (const e of events) {
    if (GOAL_GLYPHS.has(e.type)) bump(e.player_id, "goals");
    else if (e.type === "🟨") bump(e.player_id, "yellow");
    else if (e.type === "🟥") bump(e.player_id, "red");
  }
  return map;
}
function only_players(xs: (number | MatchPlayer)[]): MatchPlayer[] {
  return xs.filter((x): x is MatchPlayer => typeof x !== "number");
}
function group_by_position(xi: MatchPlayer[]): Record<Position, MatchPlayer[]> {
  const g: Record<Position, MatchPlayer[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of xi) g[p.position]?.push(p);
  for (const k of Object.keys(g) as Position[]) g[k].sort((a, b) => (a.jersey_number || 99) - (b.jersey_number || 99));
  return g;
}

export default function MatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ fixture_id: string }>();
  const fixture_id = Number(params.fixture_id);
  const sheet_ref = useRef<PlayerSheetHandle>(null);

  const [match, set_match] = useState<Match | null>(null);
  const [comments, set_comments] = useState<MatchComment[] | null>(null);
  const [stats, set_stats] = useState<TeamMatchStats | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(fixture_id)) return;
    let cancelled = false;
    matches_api.get_match_by_fixture_id(fixture_id).then(
      m => !cancelled && set_match(m ?? null),
      () => !cancelled && set_match(null),
    );
    comments_api.for_fixture(fixture_id).then(
      c => !cancelled && set_comments(c),
      () => !cancelled && set_comments([]),
    );
    team_stats_api.for_fixture(fixture_id).then(
      s => !cancelled && set_stats(s),
      () => !cancelled && set_stats({}),
    );
    return () => {
      cancelled = true;
    };
  }, [fixture_id]);

  const fixture_version = useFixtureLiveVersion(Number.isFinite(fixture_id) ? fixture_id : null);
  const last_refresh = useRef(0);
  useLiveRefetch(fixture_version, () => {
    const now = Date.now();
    if (now - last_refresh.current < 750) return;
    last_refresh.current = now;
    matches_api.refresh_match_by_fixture_id(fixture_id).then(m => m && set_match(m)).catch(() => {});
    comments_api.refresh_for_fixture(fixture_id).then(set_comments).catch(() => {});
    team_stats_api.refresh_for_fixture(fixture_id).then(set_stats).catch(() => {});
  });
  useLiveRefetch(usePricesLiveVersion(), () => {
    void valuations_api.refresh().then(() => bump(v => v + 1));
  });

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.back} onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back_label}>← Back</Text>
        </Pressable>
        {match === null ? (
          <Text style={styles.loading}>Loading match…</Text>
        ) : (
          <MatchBody match={match} comments={comments} stats={stats} on_open={p => sheet_ref.current?.open(p)} />
        )}
      </ScrollView>
      <PlayerSheet ref={sheet_ref} />
    </View>
  );
}

function MatchBody({
  match,
  comments,
  stats,
  on_open,
}: {
  match: Match;
  comments: MatchComment[] | null;
  stats: TeamMatchStats | null;
  on_open: (player: Player) => void;
}) {
  const home = teams_api.get(match.home_team_id);
  const away = teams_api.get(match.away_team_id);
  const is_live = match.status === "live";
  const goals = useMemo(
    () => match.events.filter(e => GOAL_GLYPHS.has(e.type)).sort((a, b) => a.minute - b.minute),
    [match.events],
  );
  const counts = useMemo(() => count_events(match.events), [match.events]);
  const home_xi = useMemo(() => group_by_position(only_players(match.home_xi)), [match.home_xi]);
  const away_xi = useMemo(() => group_by_position(only_players(match.away_xi)), [match.away_xi]);
  const home_bench = useMemo(() => [...(match.home_bench ?? [])].sort((a, b) => (a.jersey_number || 99) - (b.jersey_number || 99)), [match.home_bench]);
  const away_bench = useMemo(() => [...(match.away_bench ?? [])].sort((a, b) => (a.jersey_number || 99) - (b.jersey_number || 99)), [match.away_bench]);
  const home_color = match.home_kit_color ?? home?.color;
  const away_color = match.away_kit_color ?? away?.color;

  return (
    <View style={{ gap: 16 }}>
      {/* Score header */}
      <View style={styles.card}>
        <View style={styles.score_top}>
          <Text style={styles.group}>Group {match.group}</Text>
          {is_live ? (
            <View style={styles.live}>
              <View style={styles.live_dot} />
              <Text style={styles.live_label}>{match.minute}'</Text>
            </View>
          ) : (
            <Text style={styles.ft}>Full time</Text>
          )}
        </View>
        <View style={styles.score_row}>
          <View style={styles.score_team}>
            <Text style={styles.score_flag}>{home?.flag}</Text>
            <Text style={styles.score_name} numberOfLines={1}>{home?.name ?? match.home_team_id}</Text>
            <Scorers goals={goals.filter(g => g.team_id === match.home_team_id)} align="center" />
          </View>
          <Text style={styles.score}>{match.home_score} : {match.away_score}</Text>
          <View style={styles.score_team}>
            <Text style={styles.score_flag}>{away?.flag}</Text>
            <Text style={styles.score_name} numberOfLines={1}>{away?.name ?? match.away_team_id}</Text>
            <Scorers goals={goals.filter(g => g.team_id === match.away_team_id)} align="center" />
          </View>
        </View>
      </View>

      {/* Match stats */}
      <StatsPanel stats={stats} home_id={match.home_team_id} away_id={match.away_team_id} home_color={home_color} away_color={away_color} />

      {/* Lineups */}
      <View style={styles.card}>
        <View style={styles.lineup_head}>
          <Text style={[styles.lineup_team, home_color ? { borderLeftColor: home_color, borderLeftWidth: 3, paddingLeft: 8 } : null]} numberOfLines={1}>
            {home?.flag} {home?.name ?? match.home_team_id}
          </Text>
          <Text style={[styles.lineup_team, away_color ? { borderLeftColor: away_color, borderLeftWidth: 3, paddingLeft: 8 } : null]} numberOfLines={1}>
            {away?.flag} {away?.name ?? match.away_team_id}
          </Text>
        </View>
        <View style={styles.lineup_body}>
          {POSITION_GROUPS.map(g => {
            const h = home_xi[g.key];
            const a = away_xi[g.key];
            if (h.length === 0 && a.length === 0) return null;
            return (
              <View key={g.key}>
                <Divider label={g.label} />
                <View style={styles.two_col}>
                  <View style={styles.col}>{h.map(p => <RosterCard key={p.id} p={p} color={home_color} counts={counts.get(p.id)} on_open={on_open} />)}</View>
                  <View style={styles.col}>{a.map(p => <RosterCard key={p.id} p={p} color={away_color} counts={counts.get(p.id)} on_open={on_open} />)}</View>
                </View>
              </View>
            );
          })}
          {(home_bench.length > 0 || away_bench.length > 0) && (
            <>
              <Divider label="Substitutes" />
              <View style={styles.two_col}>
                <View style={styles.col}>{home_bench.map(p => <RosterCard key={p.id} p={p} color={home_color} counts={counts.get(p.id)} on_open={on_open} sub />)}</View>
                <View style={styles.col}>{away_bench.map(p => <RosterCard key={p.id} p={p} color={away_color} counts={counts.get(p.id)} on_open={on_open} sub />)}</View>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Commentary */}
      <View style={styles.card}>
        <Text style={styles.section_title}>Commentary</Text>
        <Commentary comments={comments} />
      </View>
    </View>
  );
}

function Scorers({ goals, align }: { goals: MatchEvent[]; align: "center" }) {
  if (goals.length === 0) return null;
  return (
    <View style={{ marginTop: 8, alignItems: align }}>
      {goals.map((g, i) => (
        <Text key={`${g.minute}-${i}`} style={styles.scorer}>
          ⚽ {g.player_name ?? "?"}
          {g.type === "🎯" ? " (p)" : ""} <Text style={styles.scorer_min}>{g.minute}'</Text>
        </Text>
      ))}
    </View>
  );
}

function RosterCard({
  p,
  color,
  counts,
  on_open,
  sub,
}: {
  p: MatchPlayer;
  color?: string;
  counts?: EventCounts;
  on_open: (player: Player) => void;
  sub?: boolean;
}) {
  const ref_player = players_api.get(p.id);
  const live_price = valuations_api.get_for_player(p.id)?.current_price ?? p.value;
  const match_change = p.change_last_match ?? 0;
  const photo = ref_player?.image_path;
  // Tap opens the player sheet — only for players in our tradable universe
  // (others have no reference Player, so there is nothing to show).
  return (
    <Pressable
      onPress={ref_player ? () => on_open(ref_player) : undefined}
      disabled={!ref_player}
      style={[styles.rc, color ? { borderLeftColor: color, borderLeftWidth: 3 } : null, sub && styles.rc_sub]}
    >
      <View style={styles.rc_avatar_wrap}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.rc_avatar} resizeMode="cover" />
        ) : (
          <View style={styles.rc_avatar}><Text style={styles.rc_jersey_fallback}>{p.jersey_number}</Text></View>
        )}
      </View>
      <View style={styles.rc_meta}>
        <View style={styles.rc_name_row}>
          <Text style={styles.rc_name} numberOfLines={1}>{p.name}</Text>
          {counts && (counts.goals > 0 || counts.yellow > 0 || counts.red > 0) && (
            <Text style={styles.rc_badges}>
              {counts.goals > 0 ? `⚽${counts.goals > 1 ? counts.goals : ""}` : ""}
              {counts.yellow > 0 ? "🟨" : ""}
              {counts.red > 0 ? "🟥" : ""}
            </Text>
          )}
        </View>
        <View style={styles.rc_stat_row}>
          <TickValue value={live_price}>
            <Text style={styles.rc_price}>€{live_price}M</Text>
          </TickValue>
          <Text style={[styles.rc_delta, { color: color_for_sign(match_change) }]}>{fmt_signed_pct(match_change, 1)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function StatsPanel({
  stats,
  home_id,
  away_id,
  home_color,
  away_color,
}: {
  stats: TeamMatchStats | null;
  home_id: string;
  away_id: string;
  home_color?: string;
  away_color?: string;
}) {
  const home = stats?.[home_id] ?? {};
  const away = stats?.[away_id] ?? {};
  const rows = STAT_ROWS.filter(r => r.code in home || r.code in away);
  return (
    <View style={styles.card}>
      <Text style={styles.section_title}>Match stats</Text>
      {stats === null ? (
        <Text style={styles.loading_inline}>loading…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.loading_inline}>No stats yet.</Text>
      ) : (
        <View style={{ padding: 14, gap: 10 }}>
          {rows.map(r => {
            const h = home[r.code] ?? 0;
            const a = away[r.code] ?? 0;
            const total = h + a;
            const share = total > 0 ? h / total : 0.5;
            const fmt = (v: number) => (r.pct ? `${Math.round(v)}%` : String(Math.round(v)));
            return (
              <View key={r.code} style={{ gap: 4 }}>
                <View style={styles.stat_head}>
                  <Text style={styles.stat_v}>{fmt(h)}</Text>
                  <Text style={styles.stat_label}>{r.label}</Text>
                  <Text style={[styles.stat_v, { textAlign: "right" }]}>{fmt(a)}</Text>
                </View>
                <View style={styles.stat_bar}>
                  <View style={{ flex: share, backgroundColor: home_color ?? "rgba(255,255,255,0.5)" }} />
                  <View style={{ flex: 1 - share, backgroundColor: away_color ?? "rgba(255,255,255,0.25)" }} />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function Commentary({ comments }: { comments: MatchComment[] | null }) {
  if (comments === null) return <Text style={styles.loading_inline}>loading commentary…</Text>;
  if (comments.length === 0) return <Text style={styles.loading_inline}>No commentary for this match.</Text>;
  const chrono = [...comments].reverse();
  return (
    <View style={{ padding: 8 }}>
      {chrono.map(c => {
        const min = c.extra_minute ? `${c.minute}+${c.extra_minute}'` : `${c.minute}'`;
        const accent = c.is_goal ? palette.positive : c.is_important ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.25)";
        return (
          <View key={c.id} style={[styles.cm, c.is_goal && styles.cm_goal, { borderLeftColor: accent, borderLeftWidth: 3 }]}>
            <View style={styles.cm_min_col}>
              <Text style={[styles.cm_min, { color: accent }]}>{min}</Text>
              {c.is_goal && <Text style={styles.cm_ball}>⚽</Text>}
            </View>
            <Text style={[styles.cm_text, c.is_goal && styles.cm_text_goal]}>{c.comment}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.divider_line} />
      <Text style={styles.divider_label}>{label}</Text>
      <View style={styles.divider_line} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { padding: 16, paddingTop: 12, gap: 16 },
  back: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  back_label: { color: text.secondary, fontSize: 12, fontWeight: "600" },
  loading: { color: text.tertiary, fontSize: 13, textAlign: "center", paddingVertical: 60 },
  loading_inline: { color: text.tertiary, fontSize: 12, padding: 16 },

  card: { backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 14, overflow: "hidden" },
  section_title: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.6)", padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },

  score_top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingTop: 16 },
  group: { fontSize: 11, color: text.tertiary, fontWeight: "600" },
  live: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  live_dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.6)" },
  live_label: { fontFamily: mono, fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.6)" },
  ft: { fontSize: 11, color: text.tertiary, fontWeight: "600" },
  score_row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 16, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18 },
  score_team: { flex: 1, alignItems: "center" },
  score_flag: { fontSize: 44, lineHeight: 50 },
  score_name: { fontSize: 16, fontWeight: "800", color: "#fff", marginTop: 6, textAlign: "center" },
  score: { fontFamily: mono, fontSize: 38, fontWeight: "900", color: "#fff", letterSpacing: -1.5, paddingTop: 6 },
  scorer: { fontSize: 11, color: "#fff", fontWeight: "600", marginTop: 2, textAlign: "center" },
  scorer_min: { fontFamily: mono, color: text.secondary, fontWeight: "700" },

  stat_head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stat_v: { fontFamily: mono, fontSize: 12, fontWeight: "700", color: "#fff", minWidth: 32 },
  stat_label: { fontSize: 10, fontWeight: "700", color: text.secondary, letterSpacing: 0.5, textTransform: "uppercase" },
  stat_bar: { flexDirection: "row", height: 3, borderRadius: 2, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)" },

  lineup_head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  lineup_team: { flex: 1, padding: 12, fontSize: 13, fontWeight: "800", color: "#fff" },
  lineup_body: { paddingHorizontal: 10, paddingBottom: 12 },
  two_col: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  col: { flex: 1, gap: 6 },

  rc: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, backgroundColor: "rgba(255,255,255,0.035)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 10 },
  rc_sub: { backgroundColor: "rgba(255,255,255,0.012)", opacity: 0.62 },
  rc_avatar_wrap: { width: 32, height: 32 },
  rc_avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  rc_jersey_fallback: { fontFamily: mono, fontSize: 11, fontWeight: "800", color: text.secondary },
  rc_meta: { flex: 1, minWidth: 0 },
  rc_name_row: { flexDirection: "row", alignItems: "center", gap: 4 },
  rc_name: { fontSize: 12, fontWeight: "700", color: "#fff", flexShrink: 1 },
  rc_badges: { fontSize: 10 },
  rc_stat_row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  rc_price: { fontFamily: mono, fontSize: 12, fontWeight: "800", color: "#fff" },
  rc_delta: { fontFamily: mono, fontSize: 10, fontWeight: "700" },

  cm: { flexDirection: "row", gap: 10, padding: 10, borderRadius: 8, marginBottom: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.03)" },
  cm_goal: { backgroundColor: "rgba(55,255,99,0.05)", borderColor: "rgba(55,255,99,0.1)" },
  cm_min_col: { alignItems: "center", minWidth: 36, gap: 1 },
  cm_min: { fontFamily: mono, fontSize: 11, fontWeight: "800" },
  cm_ball: { fontSize: 13 },
  cm_text: { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.85)", lineHeight: 17 },
  cm_text_goal: { color: "#fff", fontWeight: "700" },

  divider: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 14, paddingBottom: 10 },
  divider_line: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.07)" },
  divider_label: { fontSize: 10, fontWeight: "700", color: text.secondary, letterSpacing: 1.2, textTransform: "uppercase" },
});
