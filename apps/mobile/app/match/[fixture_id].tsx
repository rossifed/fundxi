// MatchView — fixture detail (pushed screen). RN port of
// apps/web/src/ui/pages/match/MatchView.tsx, adapted to a single scrollable
// column: score header + scorers, match stats, commentary, and the lineups
// (home/away grouped by position, with goal/card badges + live price). The
// desktop tactical PitchView and the marquee ticker are deferred — the List
// lineup carries the same data. Live via the fixture/{id} + prices topics.

import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
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
import { mono, palette, text, with_alpha } from "@/theme/tokens";

type Tab = "compos" | "stats" | "events";
const TABS: { key: Tab; label: string }[] = [
  { key: "compos", label: "Compos" },
  { key: "stats", label: "Stats" },
  { key: "events", label: "Events" },
];

type ComposView = "xi" | "bench";

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
  { code: "offsides", label: "Offsides" },
  { code: "yellowcards", label: "Yellow cards" },
  { code: "redcards", label: "Red cards" },
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
      {match === null ? (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]} showsVerticalScrollIndicator={false}>
          <Pressable style={styles.back} onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.back_label}>← Back</Text>
          </Pressable>
          <Text style={styles.loading}>Loading match…</Text>
        </ScrollView>
      ) : (
        <MatchBody
          match={match}
          comments={comments}
          stats={stats}
          on_open={p => sheet_ref.current?.open(p)}
          top_pad={insets.top + 12}
          on_back={() => router.back()}
        />
      )}
      <PlayerSheet ref={sheet_ref} />
    </View>
  );
}

function MatchBody({
  match,
  comments,
  stats,
  on_open,
  top_pad,
  on_back,
}: {
  match: Match;
  comments: MatchComment[] | null;
  stats: TeamMatchStats | null;
  on_open: (player: Player) => void;
  top_pad: number;
  on_back: () => void;
}) {
  const [tab, set_tab] = useState<Tab>("compos");
  const [compos_view, set_compos_view] = useState<ComposView>("xi");
  const router = useRouter();
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
  // Bench grouped by position too, like the starting XI (GK / DF / MF / FW).
  const home_bench = useMemo(() => group_by_position(match.home_bench ?? []), [match.home_bench]);
  const away_bench = useMemo(() => group_by_position(match.away_bench ?? []), [match.away_bench]);
  const home_color = match.home_kit_color ?? home?.color;
  const away_color = match.away_kit_color ?? away?.color;

  return (
    <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: top_pad }]} showsVerticalScrollIndicator={false}>
      <Pressable style={styles.back} onPress={on_back} hitSlop={8}>
        <Text style={styles.back_label}>← Back</Text>
      </Pressable>

      {/* Score header — carries both team identities (flag + name, left/right).
          The line-up columns map onto it (left = home, right = away), so the
          per-column team labels in Compos are redundant and dropped. */}
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
            <Pressable style={styles.score_team_tap} onPress={() => router.push(`/team/${match.home_team_id}`)} hitSlop={4}>
              <Text style={styles.score_flag}>{home?.flag}</Text>
              <Text style={styles.score_name} numberOfLines={1}>{home?.name ?? match.home_team_id}</Text>
            </Pressable>
            <Scorers goals={goals.filter(g => g.team_id === match.home_team_id)} align="center" />
          </View>
          <Text style={styles.score}>{match.home_score} : {match.away_score}</Text>
          <View style={styles.score_team}>
            <Pressable style={styles.score_team_tap} onPress={() => router.push(`/team/${match.away_team_id}`)} hitSlop={4}>
              <Text style={styles.score_flag}>{away?.flag}</Text>
              <Text style={styles.score_name} numberOfLines={1}>{away?.name ?? match.away_team_id}</Text>
            </Pressable>
            <Scorers goals={goals.filter(g => g.team_id === match.away_team_id)} align="center" />
          </View>
        </View>
      </View>

      {/* Tabs — Compos / Stats / Events */}
      <TabBar tab={tab} on_change={set_tab} />

      {tab === "compos" && (
        <View style={{ gap: 12 }}>
          {/* Starting XI vs Bench — the bench is part of the composition, kept
              in this tab behind a toggle rather than promoted to a top-level tab. */}
          <Segmented view={compos_view} on_change={set_compos_view} />
          <View style={styles.card}>
            <View style={styles.lineup_body}>
              {/* Column glow — a luminous team-color line on each column's outer
                  edge (home left / away right), fading at top and bottom. */}
              <ColumnGlow color={home_color} side="left" />
              <ColumnGlow color={away_color} side="right" />
              {compos_view === "xi" ? (
                <GroupedRoster home={home_xi} away={away_xi} counts={counts} on_open={on_open} empty="Line-up not available." />
              ) : (
                <GroupedRoster home={home_bench} away={away_bench} counts={counts} on_open={on_open} empty="No substitutes listed." />
              )}
            </View>
          </View>
        </View>
      )}

      {tab === "stats" && (
        <StatsPanel stats={stats} home_id={match.home_team_id} away_id={match.away_team_id} home_color={home_color} away_color={away_color} />
      )}

      {tab === "events" && (
        <View style={styles.card}>
          <Text style={styles.section_title}>Match events</Text>
          <Commentary comments={comments} />
        </View>
      )}
    </ScrollView>
  );
}

// Two columns (home | away) of roster cards split into position sections
// (GK / DF / MF / FW). Shared by the starting XI and the bench so both read the
// same way. `empty` is shown when neither side has any player.
function GroupedRoster({
  home,
  away,
  counts,
  on_open,
  empty,
}: {
  home: Record<Position, MatchPlayer[]>;
  away: Record<Position, MatchPlayer[]>;
  counts: Map<number, EventCounts>;
  on_open: (player: Player) => void;
  empty: string;
}) {
  const has_any = POSITION_GROUPS.some(g => home[g.key].length > 0 || away[g.key].length > 0);
  if (!has_any) return <Text style={styles.loading_inline}>{empty}</Text>;
  return (
    <>
      {POSITION_GROUPS.map(g => {
        const h = home[g.key];
        const a = away[g.key];
        if (h.length === 0 && a.length === 0) return null;
        return (
          <View key={g.key}>
            <Divider label={g.label} />
            <View style={styles.two_col}>
              <View style={styles.col}>{h.map(p => <RosterCard key={p.id} p={p} counts={counts.get(p.id)} on_open={on_open} />)}</View>
              <View style={styles.col}>{a.map(p => <RosterCard key={p.id} p={p} counts={counts.get(p.id)} on_open={on_open} />)}</View>
            </View>
          </View>
        );
      })}
    </>
  );
}

// Surname only (last whitespace token) — saves width in the narrow team column so
// the scorer line fits without truncating.
function surname(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : full;
}

function Scorers({ goals, align }: { goals: MatchEvent[]; align: "center" }) {
  if (goals.length === 0) return null;
  // Group goals by scorer so a player's minutes sit on the SAME line as the name
  // ("Surname 12', 45'"), collapsing a hat-trick into one line. The minute is its
  // own non-shrinking element, so it is NEVER truncated — only the surname could
  // ellipsis as an absolute last resort (rare once it's just the surname).
  const by_player: { name: string; mins: string[] }[] = [];
  for (const g of goals) {
    const name = g.player_name ?? "?";
    const min = `${g.minute}'${g.type === "🎯" ? " (p)" : ""}`;
    const row = by_player.find(p => p.name === name);
    if (row) row.mins.push(min);
    else by_player.push({ name, mins: [min] });
  }
  return (
    <View style={{ marginTop: 8, alignItems: align }}>
      {by_player.map((p, i) => (
        <View key={`${p.name}-${i}`} style={styles.scorer_row}>
          <Text style={styles.scorer} numberOfLines={1}>⚽ {surname(p.name)}</Text>
          <Text style={styles.scorer_min} numberOfLines={1}>{p.mins.join(", ")}</Text>
        </View>
      ))}
    </View>
  );
}

function RosterCard({
  p,
  counts,
  on_open,
}: {
  p: MatchPlayer;
  counts?: EventCounts;
  on_open: (player: Player) => void;
}) {
  const ref_player = players_api.get(p.id);
  const live_price = valuations_api.get_for_player(p.id)?.current_price ?? p.value;
  const match_change = p.change_last_match ?? 0;
  const photo = ref_player?.image_path;
  // Detailed provider position (e.g. "Centre-Back") — finer than the GK/DF/MF/FW
  // section header. Shown only when the provider gives it; never invented.
  const position = ref_player?.detailed_position;
  // Tap opens the player sheet — only for players in our tradable universe
  // (others have no reference Player, so there is nothing to show).
  return (
    <Pressable
      onPress={ref_player ? () => on_open(ref_player) : undefined}
      disabled={!ref_player}
      style={styles.rc}
    >
      {/* Neutral dark portrait (team identity is on the column glow, not the
          card) with the jersey number as a small badge — always visible, and it
          never pushes the name. */}
      <View style={styles.rc_avatar_wrap}>
        <View style={styles.rc_avatar}>
          {photo ? <Image source={{ uri: photo }} style={styles.rc_avatar_img} resizeMode="cover" /> : null}
        </View>
        <Text style={styles.rc_num} numberOfLines={1}>{p.jersey_number}</Text>
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
        {position ? <Text style={styles.rc_pos} numberOfLines={1}>{position}</Text> : null}
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

function is_light(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 200; // near-white → would read as a hard border
}
// Aura tint: the provider team hex when it is distinct enough, otherwise a side
// default (blue home / warm-red away — the reference's home/away convention) so a
// white kit never paints a hard white line. Provider hex inline (allowed).
function glow_color(hex: string | undefined, side: "left" | "right"): string {
  if (hex && /^#[0-9a-fA-F]{6}$/.test(hex) && !is_light(hex)) return hex;
  return side === "left" ? palette.accentBlue : palette.negative;
}

// Team-color glow bracketing a column (home left / away right). A light vertical
// spine carries the team colour and glows softly (box-shadow); at the top and
// bottom it turns inward through a rounded corner into a short arm that dissolves
// to transparency (expo-linear-gradient) — the line wraps the line-up and fades
// out. Kept light/low-opacity so it reads as a glow, not a hard border.
const SPINE_STOPS: readonly [number, number, number, number] = [0, 0.02, 0.98, 1];
function ColumnGlow({ color, side }: { color?: string; side: "left" | "right" }) {
  const c = glow_color(color, side);
  const left = side === "left";
  const arm_colors: readonly [string, string] = left ? [`${c}a6`, `${c}00`] : [`${c}00`, `${c}a6`];
  const arm_edge = left ? styles.arm_l : styles.arm_r;
  return (
    <>
      {/* vertical spine + soft glow */}
      <LinearGradient
        pointerEvents="none"
        colors={[`${c}00`, `${c}a6`, `${c}a6`, `${c}00`]}
        locations={SPINE_STOPS}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.glow_spine, left ? styles.glow_edge_l : styles.glow_edge_r, { boxShadow: `0px 0px 12px 1px ${c}40` }]}
      />
      {/* rounded corners that wrap the top and bottom */}
      <View pointerEvents="none" style={[left ? styles.corner_tl : styles.corner_tr, { borderColor: `${c}8c` }]} />
      <View pointerEvents="none" style={[left ? styles.corner_bl : styles.corner_br, { borderColor: `${c}8c` }]} />
      {/* arms turn inward and dissolve in a gradient (top a touch longer) */}
      <LinearGradient
        pointerEvents="none"
        colors={arm_colors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.glow_arm, arm_edge, { top: 2, width: "22%" }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={arm_colors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.glow_arm, arm_edge, { bottom: 2, width: "18%" }]}
      />
    </>
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

function Segmented({ view, on_change }: { view: ComposView; on_change: (v: ComposView) => void }) {
  return (
    <View style={styles.seg}>
      {(["xi", "bench"] as const).map(v => {
        const active = v === view;
        return (
          <Pressable key={v} onPress={() => on_change(v)} style={[styles.seg_btn, active && styles.seg_btn_on]} hitSlop={4}>
            <Text style={[styles.seg_label, active && styles.seg_label_on]}>{v === "xi" ? "Starting XI" : "Bench"}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TabBar({ tab, on_change }: { tab: Tab; on_change: (t: Tab) => void }) {
  return (
    <View style={styles.tabbar}>
      {TABS.map(t => {
        const active = t.key === tab;
        return (
          <Pressable key={t.key} onPress={() => on_change(t.key)} style={styles.tab} hitSlop={6}>
            <Text style={[styles.tab_label, active && styles.tab_label_active]}>{t.label}</Text>
            {active ? <View style={styles.tab_underline} /> : null}
          </Pressable>
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
  score_row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 10, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 18 },
  score_team: { flex: 1, alignItems: "center" },
  score_team_tap: { alignItems: "center" },
  score_flag: { fontSize: 44, lineHeight: 50 },
  score_name: { fontSize: 16, fontWeight: "800", color: "#fff", marginTop: 6, textAlign: "center" },
  score: { fontFamily: mono, fontSize: 38, fontWeight: "900", color: "#fff", letterSpacing: -1.5, paddingTop: 6 },
  // No width constraint → the surname is never clipped by the minute; the row
  // sizes to its content (one line each, both flexShrink:0) and stays centered.
  scorer_row: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  scorer: { fontSize: 10.5, color: "#fff", fontWeight: "600", flexShrink: 0 },
  scorer_min: { fontFamily: mono, fontSize: 10.5, color: text.secondary, fontWeight: "700", flexShrink: 0 },

  stat_head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stat_v: { fontFamily: mono, fontSize: 12, fontWeight: "700", color: "#fff", minWidth: 32 },
  stat_label: { fontSize: 10, fontWeight: "700", color: text.secondary, letterSpacing: 0.5, textTransform: "uppercase" },
  stat_bar: { flexDirection: "row", height: 3, borderRadius: 2, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)" },

  seg: { flexDirection: "row", alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 9, padding: 3, gap: 2 },
  seg_btn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: "transparent" },
  seg_btn_on: { backgroundColor: palette.accentBlueSoft, borderColor: palette.accentBlue },
  seg_label: { fontSize: 11, fontWeight: "700", color: text.tertiary, letterSpacing: 0.3 },
  seg_label_on: { color: "#fff" },
  tabbar: { flexDirection: "row", gap: 26, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  tab: { paddingVertical: 10, alignItems: "center" },
  tab_label: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", color: text.tertiary },
  tab_label_active: { color: "#fff" },
  tab_underline: { position: "absolute", bottom: -1, left: 0, right: 0, height: 2, borderRadius: 2, backgroundColor: "#fff" },
  lineup_body: { position: "relative", paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 },
  two_col: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  col: { flex: 1, gap: 4 },
  // Light team-color spine (glows via box-shadow) that wraps the top/bottom with
  // rounded corners and arms dissolving inward.
  glow_spine: { position: "absolute", top: 2, bottom: 2, width: 2, borderRadius: 2 },
  glow_edge_l: { left: 1 },
  glow_edge_r: { right: 1 },
  corner_tl: { position: "absolute", top: 2, left: 1, width: 11, height: 11, borderLeftWidth: 2, borderTopWidth: 2, borderTopLeftRadius: 11 },
  corner_bl: { position: "absolute", bottom: 2, left: 1, width: 11, height: 11, borderLeftWidth: 2, borderBottomWidth: 2, borderBottomLeftRadius: 11 },
  corner_tr: { position: "absolute", top: 2, right: 1, width: 11, height: 11, borderRightWidth: 2, borderTopWidth: 2, borderTopRightRadius: 11 },
  corner_br: { position: "absolute", bottom: 2, right: 1, width: 11, height: 11, borderRightWidth: 2, borderBottomWidth: 2, borderBottomRightRadius: 11 },
  glow_arm: { position: "absolute", height: 2, borderRadius: 2 },
  arm_l: { left: 12 },
  arm_r: { right: 12 },

  // Compact, near-borderless player card — low contrast so rows read as part of
  // the column, not floating chips.
  rc: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 6, paddingHorizontal: 7, backgroundColor: "rgba(255,255,255,0.028)", borderWidth: 1, borderColor: "rgba(255,255,255,0.035)", borderRadius: 11 },
  rc_avatar_wrap: { width: 30, height: 30 },
  rc_avatar: { width: 30, height: 30, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  rc_avatar_img: { width: "100%", height: "100%" },
  // Jersey number — small, dim, secondary (kept visible, not dominant).
  rc_num: { position: "absolute", bottom: -3, right: -3, fontFamily: mono, fontSize: 8, fontWeight: "700", color: "rgba(255,255,255,0.7)", backgroundColor: `${palette.bg}e6`, borderRadius: 6, paddingHorizontal: 3, paddingVertical: 0.5, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  rc_meta: { flex: 1, minWidth: 0 },
  rc_name_row: { flexDirection: "row", alignItems: "center", gap: 4 },
  rc_name: { fontSize: 12, fontWeight: "600", color: "#fff", flexShrink: 1 },
  rc_pos: { fontSize: 9, fontWeight: "600", color: text.tertiary, letterSpacing: 0.2, marginTop: 1 },
  rc_badges: { fontSize: 10 },
  rc_stat_row: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 1 },
  rc_price: { fontFamily: mono, fontSize: 11.5, fontWeight: "700", color: "rgba(255,255,255,0.78)" },
  rc_delta: { fontFamily: mono, fontSize: 10, fontWeight: "700" },

  cm: { flexDirection: "row", gap: 10, padding: 10, borderRadius: 8, marginBottom: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.03)" },
  cm_goal: { backgroundColor: with_alpha(palette.positive, 0.05), borderColor: with_alpha(palette.positive, 0.1) },
  cm_min_col: { alignItems: "center", minWidth: 36, gap: 1 },
  cm_min: { fontFamily: mono, fontSize: 11, fontWeight: "800" },
  cm_ball: { fontSize: 13 },
  cm_text: { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.85)", lineHeight: 17 },
  cm_text_goal: { color: "#fff", fontWeight: "700" },

  divider: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10, paddingBottom: 6 },
  divider_line: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.05)" },
  divider_label: { fontSize: 9, fontWeight: "700", color: text.muted, letterSpacing: 1, textTransform: "uppercase" },
});
