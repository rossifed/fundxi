// Fixtures — RN port of apps/web/src/ui/pages/fixtures/FixturesPage.tsx.
//
// Same three views as the web (Calendar / Bracket / Groups) and the same
// status filter, live refresh and portfolio-exposure marker. The web bracket
// is a 7-column mirrored desktop layout; on mobile the knockouts stack as
// vertical round sections (R16 → QF → SF → Final → 3rd), which is the natural
// single-column adaptation. Match/team navigation is display-only here —
// MatchView and TeamPage are separate later ports.

import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { matches_api } from "@fundxi/core/api/matches_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { standings_api, type GroupStanding } from "@fundxi/core/api/standings_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import type { Fixture, FixtureStatus } from "@fundxi/core/domain/match/fixture";
import { build_bracket, type BracketLayout } from "@fundxi/core/domain/match/bracket";

import { LiveBadge } from "@/components/LiveBadge";
import { useLiveRefetch, useMatchesLiveVersion, useStandingsLiveVersion } from "@/components/live";
import { palette, text } from "@/theme/tokens";

type StatusFilter = "all" | FixtureStatus;
type ViewMode = "calendar" | "bracket" | "groups";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "finished", label: "Completed" },
  { key: "upcoming", label: "Upcoming" },
];

const STAGE_CHIP: Record<string, string> = {
  "Round of 16": "R16",
  "Quarter-finals": "QF",
  "Semi-finals": "SF",
  "3rd Place Final": "3RD",
  Final: "FINAL",
};

interface DayGroup {
  day_key: string;
  weekday: string;
  date_label: string;
  is_today: boolean;
  fixtures: Fixture[];
}

function today_key(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function compare_by_kickoff(a: Fixture, b: Fixture): number {
  if (!a.date) return 1;
  if (!b.date) return -1;
  return a.date.localeCompare(b.date);
}
function format_weekday(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { weekday: "long" }) : "TBD";
}
function format_date_label(iso?: string): string {
  if (!iso) return "Date to be confirmed";
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleDateString(undefined, { month: "long" })}`;
}
function format_kickoff_time(iso?: string): string {
  return iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
}
function group_by_day(fixtures: Fixture[]): DayGroup[] {
  const today = today_key();
  const groups = new Map<string, DayGroup>();
  for (const fx of fixtures) {
    const key = fx.date ? fx.date.slice(0, 10) : "tbd";
    let g = groups.get(key);
    if (!g) {
      g = { day_key: key, weekday: format_weekday(fx.date), date_label: format_date_label(fx.date), is_today: key === today, fixtures: [] };
      groups.set(key, g);
    }
    g.fixtures.push(fx);
  }
  for (const g of groups.values()) g.fixtures.sort(compare_by_kickoff);
  return [...groups.values()].sort((a, b) => a.day_key.localeCompare(b.day_key));
}
function phase_chip(fx: Fixture): string {
  if (fx.stage_name === "Group Stage") {
    const md = fx.round_name ? ` · MD${fx.round_name}` : "";
    return fx.group ? `GROUP ${fx.group}${md}` : `GROUP${md}`;
  }
  if (fx.stage_name && STAGE_CHIP[fx.stage_name]) return STAGE_CHIP[fx.stage_name];
  return "KO";
}

export default function FixturesScreen() {
  const [filter, set_filter] = useState<StatusFilter>("all");
  const [view_mode, set_view_mode] = useState<ViewMode>("calendar");

  const [data_version, set_data_version] = useState(0);
  useLiveRefetch(useMatchesLiveVersion(), () => {
    void matches_api.refresh_fixtures().then(() => set_data_version(v => v + 1));
  });

  const all = useMemo(() => matches_api.list_fixtures(), [data_version]);
  const fixtures = filter === "all" ? all : all.filter(f => f.status === filter);
  const days = useMemo(() => group_by_day(fixtures), [fixtures]);

  const [portfolio_version, set_portfolio_version] = useState(0);
  useEffect(() => portfolio_api.subscribe(() => set_portfolio_version(v => v + 1)), []);
  const held_by_team = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const h of portfolio_api.get_holdings()) {
      const list = map.get(h.player.team_id) ?? [];
      list.push(h.player.name);
      map.set(h.player.team_id, list);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio_version]);
  const held_for = (fx: Fixture): string[] => [
    ...(held_by_team.get(fx.home_team_id) ?? []),
    ...(held_by_team.get(fx.away_team_id) ?? []),
  ];

  const filter_disabled = view_mode !== "calendar";

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.status_tabs}>
          {STATUS_TABS.map(t => {
            const on = filter === t.key;
            return (
              <Pressable
                key={t.key}
                disabled={filter_disabled}
                onPress={() => set_filter(t.key)}
                style={[styles.status_tab, on && styles.status_tab_on, filter_disabled && styles.disabled]}
              >
                <Text style={[styles.status_tab_label, on && styles.status_tab_label_on]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.view_switch}>
          {(["calendar", "bracket", "groups"] as const).map(m => {
            const on = view_mode === m;
            const label = m === "calendar" ? "Cal" : m === "bracket" ? "Bracket" : "Groups";
            return (
              <Pressable key={m} onPress={() => set_view_mode(m)} style={[styles.view_btn, on && styles.view_btn_on]}>
                <Text style={[styles.view_btn_label, on && styles.view_btn_label_on]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {view_mode === "calendar" ? (
          <CalendarView days={days} held_for={held_for} />
        ) : view_mode === "bracket" ? (
          <BracketView fixtures={all} />
        ) : (
          <GroupsView />
        )}
      </ScrollView>
    </View>
  );
}

// ── Calendar ──────────────────────────────────────────────────────────
function CalendarView({ days, held_for }: { days: DayGroup[]; held_for: (fx: Fixture) => string[] }) {
  if (days.length === 0) return <Text style={styles.empty}>No fixtures for this filter.</Text>;
  return (
    <View style={{ gap: 16 }}>
      {days.map(day => (
        <View key={day.day_key} style={[styles.day, day.is_today && styles.day_today]}>
          <View style={[styles.day_head, day.is_today && styles.day_head_today]}>
            <Text style={[styles.day_weekday, day.is_today && styles.day_weekday_today]}>{day.weekday}</Text>
            <Text style={styles.day_date}>{day.date_label}</Text>
            {day.is_today && (
              <View style={styles.today_badge}>
                <Text style={styles.today_badge_label}>TODAY</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            <Text style={styles.day_count}>
              {day.fixtures.length} {day.fixtures.length > 1 ? "matches" : "match"}
            </Text>
          </View>
          <View style={styles.day_body}>
            {day.fixtures.map(fx => (
              <FixtureCard key={fx.id} fixture={fx} held_players={held_for(fx)} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function FixtureCard({ fixture, held_players }: { fixture: Fixture; held_players: string[] }) {
  const home = teams_api.get(fixture.home_team_id);
  const away = teams_api.get(fixture.away_team_id);
  if (!home || !away) return null;
  const is_live = fixture.status === "live";
  const is_finished = fixture.status === "finished";
  const time = format_kickoff_time(fixture.date);

  return (
    <View style={[styles.fx_card, is_live && styles.fx_card_live]}>
      <View style={styles.fx_top}>
        <View style={styles.fx_top_left}>
          {is_live ? <LiveBadge /> : is_finished ? <View style={styles.ft}><Text style={styles.ft_label}>FT</Text></View> : <Text style={styles.upcoming}>Upcoming</Text>}
          <View style={styles.phase}>
            <Text style={styles.phase_label}>{phase_chip(fixture)}</Text>
          </View>
          {held_players.length > 0 && (
            <View style={styles.held}>
              <View style={styles.held_dot} />
              <Text style={styles.held_label}>{held_players.length === 1 ? held_players[0] : `${held_players.length} holdings`}</Text>
            </View>
          )}
        </View>
        {time ? <Text style={styles.fx_time}>{time}</Text> : null}
      </View>

      <View style={styles.fx_teams}>
        <View style={styles.fx_team_right}>
          <Text style={styles.fx_team_name} numberOfLines={1}>{home.name}</Text>
          <Text style={styles.fx_flag}>{home.flag}</Text>
        </View>
        {fixture.status !== "upcoming" ? (
          <Text style={styles.fx_score}>{fixture.home_score} : {fixture.away_score}</Text>
        ) : (
          <Text style={styles.fx_vs}>VS</Text>
        )}
        <View style={styles.fx_team_left}>
          <Text style={styles.fx_flag}>{away.flag}</Text>
          <Text style={styles.fx_team_name} numberOfLines={1}>{away.name}</Text>
        </View>
      </View>

      {(fixture.venue_name || fixture.note) && (
        <Text style={styles.fx_venue}>
          {fixture.venue_name}
          {fixture.venue_name && fixture.note ? " · " : ""}
          {fixture.note}
        </Text>
      )}
    </View>
  );
}

// ── Bracket (vertical rounds) ───────────────────────────────────────────
function BracketView({ fixtures }: { fixtures: Fixture[] }) {
  const by_group = new Map<string, Fixture[]>();
  for (const fx of fixtures) {
    if (fx.stage_name === "Group Stage" && fx.group) {
      const list = by_group.get(fx.group) ?? [];
      list.push(fx);
      by_group.set(fx.group, list);
    }
  }
  for (const list of by_group.values()) list.sort(compare_by_kickoff);
  const group_letters = [...by_group.keys()].sort();
  const bracket = build_bracket(fixtures);

  const ko_rounds: { label: string; fixtures: (Fixture | null)[] }[] = [
    { label: "ROUND OF 16", fixtures: [...bracket.r16_left, ...bracket.r16_right] },
    { label: "QUARTER-FINALS", fixtures: [...bracket.qf_left, ...bracket.qf_right] },
    { label: "SEMI-FINALS", fixtures: [bracket.sf_left, bracket.sf_right] },
    { label: "FINAL", fixtures: [bracket.final] },
    { label: "3RD PLACE", fixtures: [bracket.third_place] },
  ];

  return (
    <View style={{ gap: 22 }}>
      {group_letters.length > 0 && (
        <View style={{ gap: 10 }}>
          <Divider label="GROUP STAGE" />
          <View style={styles.group_grid}>
            {group_letters.map(letter => (
              <View key={letter} style={styles.bracket_panel}>
                <View style={styles.bracket_chip}>
                  <Text style={styles.bracket_chip_label}>GROUP {letter}</Text>
                </View>
                <View style={{ gap: 4 }}>
                  {(by_group.get(letter) ?? []).map(fx => (
                    <CompactCell key={fx.id} fixture={fx} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ gap: 10 }}>
        <Divider label="KNOCKOUTS" />
        {ko_rounds.map(round => {
          const present = round.fixtures.filter((f): f is Fixture => f !== null);
          if (present.length === 0) return null;
          return (
            <View key={round.label} style={styles.bracket_panel}>
              <View style={styles.bracket_chip}>
                <Text style={styles.bracket_chip_label}>{round.label}</Text>
              </View>
              <View style={styles.ko_grid}>
                {present.map(fx => (
                  <View key={fx.id} style={styles.ko_cell}>
                    <CompactCell fixture={fx} />
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CompactCell({ fixture }: { fixture: Fixture }) {
  const home = teams_api.get(fixture.home_team_id);
  const away = teams_api.get(fixture.away_team_id);
  const is_live = fixture.status === "live";
  const is_today = fixture.date ? fixture.date.slice(0, 10) === today_key() : false;
  const played = fixture.status === "finished" || is_live;
  const time = format_kickoff_time(fixture.date);

  return (
    <View style={[styles.cc, is_today && styles.cc_today, is_live && styles.cc_live]}>
      <CellTeamRow flag={home?.flag} code={fixture.home_team_id} score={fixture.home_score} played={played} />
      <CellTeamRow flag={away?.flag} code={fixture.away_team_id} score={fixture.away_score} played={played} />
      {!played && <Text style={[styles.cc_time, is_today && styles.cc_time_today]}>{time || "·"}</Text>}
    </View>
  );
}

function CellTeamRow({ flag, code, score, played }: { flag?: string; code: string; score?: number; played: boolean }) {
  return (
    <View style={styles.cc_row}>
      <Text style={styles.cc_flag}>{flag ?? ""}</Text>
      <Text style={styles.cc_code} numberOfLines={1}>{code}</Text>
      <Text style={[styles.cc_score, !played && styles.cc_score_off]}>{played ? (score ?? 0) : "-"}</Text>
    </View>
  );
}

// ── Groups (standings tables) ──────────────────────────────────────────
function GroupsView() {
  const standings_version = useStandingsLiveVersion();
  const [groups, set_groups] = useState<GroupStanding[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void standings_api.list().then(data => {
      if (!cancelled) set_groups([...data].sort((a, b) => a.group.localeCompare(b.group)));
    });
    return () => {
      cancelled = true;
    };
  }, [standings_version]);

  if (groups === null) return <Text style={styles.empty}>Loading group tables…</Text>;
  if (groups.length === 0) return <Text style={styles.empty}>No group standings available yet</Text>;

  return (
    <View style={{ gap: 12 }}>
      {groups.map(g => (
        <View key={g.group} style={styles.bracket_panel}>
          <View style={[styles.bracket_chip, { marginBottom: 6 }]}>
            <Text style={styles.bracket_chip_label}>GROUP {g.group}</Text>
          </View>
          <View style={[styles.std_row, styles.std_head]}>
            <Text style={[styles.std_pos, styles.std_h]}>#</Text>
            <Text style={[styles.std_team, styles.std_h]}>Team</Text>
            <Text style={[styles.std_num, styles.std_h]}>P</Text>
            <Text style={[styles.std_num, styles.std_h]}>W</Text>
            <Text style={[styles.std_num, styles.std_h]}>D</Text>
            <Text style={[styles.std_num, styles.std_h]}>L</Text>
            <Text style={[styles.std_gd, styles.std_h]}>GD</Text>
            <Text style={[styles.std_pts, styles.std_h]}>Pts</Text>
          </View>
          {g.rows.map(r => {
            const q = r.position <= 2;
            return (
              <View key={r.team_id} style={[styles.std_row, q && styles.std_row_q]}>
                <Text style={[styles.std_pos, { color: q ? palette.positive : text.tertiary }]}>{r.position}</Text>
                <View style={styles.std_team_cell}>
                  {r.flag ? <Image source={{ uri: r.flag }} style={styles.std_flag} resizeMode="contain" /> : <View style={styles.std_flag} />}
                  <Text style={styles.std_name} numberOfLines={1}>{r.team_name}</Text>
                </View>
                <Text style={[styles.std_num, styles.std_dim]}>{r.played}</Text>
                <Text style={[styles.std_num, styles.std_dim]}>{r.won}</Text>
                <Text style={[styles.std_num, styles.std_dim]}>{r.drawn}</Text>
                <Text style={[styles.std_num, styles.std_dim]}>{r.lost}</Text>
                <Text style={styles.std_gd}>{r.goal_difference > 0 ? "+" : ""}{r.goal_difference}</Text>
                <Text style={styles.std_pts}>{r.points}</Text>
              </View>
            );
          })}
        </View>
      ))}
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

const mono = "SpaceMono";
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  toolbar: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  status_tabs: { flexDirection: "row", gap: 6, paddingRight: 8 },
  status_tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)" },
  status_tab_on: { backgroundColor: "rgba(255,255,255,0.08)" },
  status_tab_label: { fontSize: 12, fontWeight: "500", color: text.tertiary },
  status_tab_label_on: { color: "#fff", fontWeight: "700" },
  disabled: { opacity: 0.4 },
  view_switch: { flexDirection: "row", alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 3, gap: 2 },
  view_btn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 },
  view_btn_on: { backgroundColor: "rgba(255,255,255,0.08)" },
  view_btn_label: { fontSize: 11, fontWeight: "700", color: text.secondary, letterSpacing: 0.3 },
  view_btn_label_on: { color: "#fff" },

  scroll: { padding: 16, paddingTop: 12 },
  empty: { padding: 40, textAlign: "center", color: text.muted, fontSize: 13 },

  day: { backgroundColor: "rgba(255,255,255,0.025)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" },
  day_today: { backgroundColor: "rgba(72,255,67,0.04)", borderColor: "rgba(72,255,67,0.30)" },
  day_head: { flexDirection: "row", alignItems: "baseline", gap: 10, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: "rgba(255,255,255,0.03)", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  day_head_today: { backgroundColor: "rgba(72,255,67,0.07)", borderBottomColor: "rgba(72,255,67,0.20)" },
  day_weekday: { fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: text.tertiary },
  day_weekday_today: { color: palette.brandGreen },
  day_date: { fontSize: 16, fontWeight: "800", color: "rgba(255,255,255,0.85)", letterSpacing: -0.2 },
  today_badge: { backgroundColor: palette.brandGreen, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  today_badge_label: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: "#0d0d0f" },
  day_count: { fontSize: 11, color: text.tertiary, fontWeight: "600" },
  day_body: { padding: 12, gap: 12 },

  fx_card: { backgroundColor: "rgba(255,255,255,0.025)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 16 },
  fx_card_live: { backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" },
  fx_top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 },
  fx_top_left: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  ft: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 5, paddingHorizontal: 9, paddingVertical: 4 },
  ft_label: { fontSize: 11, fontWeight: "700", color: text.secondary },
  upcoming: { fontSize: 11, color: text.tertiary, fontWeight: "600" },
  phase: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  phase_label: { fontSize: 10, color: text.tertiary, fontWeight: "600", letterSpacing: 0.4 },
  held: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(72,255,67,0.10)", borderWidth: 1, borderColor: "rgba(72,255,67,0.28)", borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2, flexShrink: 1 },
  held_dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.positive },
  held_label: { fontSize: 10, fontWeight: "700", color: palette.positive, flexShrink: 1 },
  fx_time: { fontFamily: mono, fontSize: 11, color: text.tertiary },
  fx_teams: { flexDirection: "row", alignItems: "center", gap: 12 },
  fx_team_right: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10 },
  fx_team_left: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  fx_team_name: { fontSize: 13, fontWeight: "700", color: "#fff", flexShrink: 1 },
  fx_flag: { fontSize: 26 },
  fx_score: { fontFamily: mono, fontSize: 24, fontWeight: "900", minWidth: 56, textAlign: "center", color: "#fff", letterSpacing: -1 },
  fx_vs: { fontFamily: mono, fontSize: 13, color: text.faint, fontWeight: "700", minWidth: 56, textAlign: "center" },
  fx_venue: { textAlign: "center", fontSize: 11, color: text.tertiary, marginTop: 10 },

  divider: { flexDirection: "row", alignItems: "center", gap: 10 },
  divider_line: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.06)" },
  divider_label: { fontSize: 11, letterSpacing: 1.4, fontWeight: "700", color: text.secondary },

  group_grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bracket_panel: { backgroundColor: "rgba(255,255,255,0.025)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 8, padding: 6, flexGrow: 1, flexBasis: "47%", gap: 6 },
  bracket_chip: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 5, paddingVertical: 5, alignItems: "center" },
  bracket_chip_label: { fontSize: 10, letterSpacing: 1.4, fontWeight: "800", color: "rgba(255,255,255,0.82)" },
  ko_grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  ko_cell: { flexGrow: 1, flexBasis: "47%" },

  cc: { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.11)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 5, gap: 2 },
  cc_today: { backgroundColor: "rgba(72,255,67,0.10)", borderColor: "rgba(72,255,67,0.40)", borderLeftWidth: 3, borderLeftColor: palette.brandGreen },
  cc_live: { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" },
  cc_row: { flexDirection: "row", alignItems: "center", gap: 6 },
  cc_flag: { fontSize: 15, width: 20, textAlign: "center" },
  cc_code: { flex: 1, fontWeight: "700", fontSize: 11, color: "#fff" },
  cc_score: { fontFamily: mono, fontSize: 12, fontWeight: "800", color: "#fff", minWidth: 16, textAlign: "right" },
  cc_score_off: { color: text.muted },
  cc_time: { fontFamily: mono, fontSize: 9, textAlign: "center", color: text.tertiary, fontWeight: "700", marginTop: 1 },
  cc_time_today: { color: palette.brandGreen },

  std_row: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 5, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)" },
  std_head: { borderTopWidth: 0, paddingBottom: 5 },
  std_row_q: { borderLeftWidth: 2, borderLeftColor: palette.positive },
  std_h: { fontSize: 9, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", color: text.tertiary },
  std_pos: { fontFamily: mono, width: 20, fontWeight: "700", fontSize: 12 },
  std_team: { flex: 1 },
  std_team_cell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  std_flag: { width: 16, height: 16 },
  std_name: { fontSize: 12, fontWeight: "600", color: "#fff", flexShrink: 1 },
  std_num: { fontFamily: mono, width: 20, textAlign: "center", fontSize: 12, color: text.secondary },
  std_dim: { color: text.secondary },
  std_gd: { fontFamily: mono, width: 34, textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.7)" },
  std_pts: { fontFamily: mono, width: 30, textAlign: "right", fontSize: 12, fontWeight: "800", color: "#fff" },
});
