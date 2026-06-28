// Fixtures — RN port of apps/web/src/ui/pages/fixtures/FixturesPage.tsx.
//
// Same three views as the web (Calendar / Bracket / Groups) and the same
// status filter, live refresh and portfolio-exposure marker. The web bracket
// is a 7-column mirrored desktop layout; on mobile the knockouts stack as
// vertical round sections (R16 → QF → SF → Final → 3rd), which is the natural
// single-column adaptation. Tapping a fixture opens the MatchView detail
// screen (app/match/[fixture_id]). Team navigation (TeamPage) is a later port.

import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { matches_api } from "@fundxi/core/api/matches_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { standings_api, type GroupStanding } from "@fundxi/core/api/standings_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import type { Fixture, FixtureStatus } from "@fundxi/core/domain/match/fixture";
import { build_bracket, type BracketLayout } from "@fundxi/core/domain/match/bracket";

import { LiveBadge } from "@/components/LiveBadge";
import { useLiveRefetch, useMatchesLiveVersion, useStandingsLiveVersion } from "@/components/live";
import { useRefresh } from "@/components/use_refresh";
import { mono, palette, text, with_alpha } from "@/theme/tokens";

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
// ``newest_first`` reverses both the day order and the within-day kickoff order,
// so the Completed tab leads with the most recent match. Upcoming/Live/All keep
// the default earliest-first order (you want the soonest match on top there).
function group_by_day(fixtures: Fixture[], newest_first = false): DayGroup[] {
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
  const dir = newest_first ? -1 : 1;
  for (const g of groups.values()) g.fixtures.sort((a, b) => dir * compare_by_kickoff(a, b));
  return [...groups.values()].sort((a, b) => dir * a.day_key.localeCompare(b.day_key));
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
  const router = useRouter();
  const open_match = (id: number) => router.push(`/match/${id}`);
  const [filter, set_filter] = useState<StatusFilter>("all");
  const [view_mode, set_view_mode] = useState<ViewMode>("calendar");

  const [data_version, set_data_version] = useState(0);
  useLiveRefetch(useMatchesLiveVersion(), () => {
    void matches_api.refresh_fixtures().then(() => set_data_version(v => v + 1));
  });

  const { refreshing, onRefresh } = useRefresh(() =>
    matches_api.refresh_fixtures().then(() => set_data_version(v => v + 1)),
  );

  const all = useMemo(() => matches_api.list_fixtures(), [data_version]);
  const fixtures = filter === "all" ? all : all.filter(f => f.status === filter);
  const days = useMemo(() => group_by_day(fixtures, filter === "finished"), [fixtures, filter]);

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

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        {/* Status filter only applies to the calendar list; bracket and groups
            show the whole tournament. Hidden there (spacer keeps the view
            switcher on the right). */}
        {view_mode === "calendar" ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.status_tabs}>
            {STATUS_TABS.map(t => {
              const on = filter === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => set_filter(t.key)}
                  style={[styles.status_tab, on && styles.status_tab_on]}
                >
                  <Text style={[styles.status_tab_label, on && styles.status_tab_label_on]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }} />
        )}
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

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {view_mode === "calendar" ? (
          <CalendarView days={days} held_for={held_for} on_open={open_match} />
        ) : view_mode === "bracket" ? (
          <BracketView fixtures={all} on_open={open_match} />
        ) : (
          <GroupsView />
        )}
      </ScrollView>
    </View>
  );
}

// ── Calendar ──────────────────────────────────────────────────────────
function CalendarView({ days, held_for, on_open }: { days: DayGroup[]; held_for: (fx: Fixture) => string[]; on_open: (id: number) => void }) {
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
              <FixtureCard key={fx.id} fixture={fx} held_players={held_for(fx)} on_open={on_open} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function FixtureCard({ fixture, held_players, on_open }: { fixture: Fixture; held_players: string[]; on_open: (id: number) => void }) {
  const home = teams_api.get(fixture.home_team_id);
  const away = teams_api.get(fixture.away_team_id);
  const router = useRouter();
  if (!home || !away) return null;
  const is_live = fixture.status === "live";
  const is_finished = fixture.status === "finished";
  const time = format_kickoff_time(fixture.date);

  return (
    <Pressable style={[styles.fx_card, is_live && styles.fx_card_live]} onPress={() => on_open(fixture.id)} accessibilityRole="button">
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
        <Pressable style={styles.fx_team_right} onPress={() => router.push(`/team/${fixture.home_team_id}`)} hitSlop={4}>
          <Text style={styles.fx_team_name} numberOfLines={1}>{home.name}</Text>
          <Text style={styles.fx_flag}>{home.flag}</Text>
        </Pressable>
        {fixture.status !== "upcoming" ? (
          <Text style={styles.fx_score}>{fixture.home_score} : {fixture.away_score}</Text>
        ) : (
          <Text style={styles.fx_vs}>VS</Text>
        )}
        <Pressable style={styles.fx_team_left} onPress={() => router.push(`/team/${fixture.away_team_id}`)} hitSlop={4}>
          <Text style={styles.fx_flag}>{away.flag}</Text>
          <Text style={styles.fx_team_name} numberOfLines={1}>{away.name}</Text>
        </Pressable>
      </View>

      {(fixture.venue_name || fixture.note) && (
        <Text style={styles.fx_venue}>
          {fixture.venue_name}
          {fixture.venue_name && fixture.note ? " · " : ""}
          {fixture.note}
        </Text>
      )}
    </Pressable>
  );
}

// ── Bracket (vertical rounds) ───────────────────────────────────────────
function BracketView({ fixtures, on_open }: { fixtures: Fixture[]; on_open: (id: number) => void }) {
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
    { label: "ROUND OF 32", fixtures: [...bracket.r32_left, ...bracket.r32_right] },
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
                    <CompactCell key={fx.id} fixture={fx} on_open={on_open} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ gap: 12 }}>
        <Divider label="KNOCKOUTS" />
        {ko_rounds.map(round => {
          // Render the full skeleton (TBD slots) even before any knockout
          // fixture exists — slots fill in as the tournament resolves.
          const single = round.fixtures.length === 1;
          if (round.label === "FINAL") {
            const f = round.fixtures[0];
            return f ? (
              <FinalCard key="final" fixture={f} on_open={on_open} />
            ) : (
              <View key="final" style={styles.bracket_panel}>
                <View style={styles.bracket_chip}>
                  <Text style={styles.bracket_chip_label}>FINAL</Text>
                </View>
                <View style={[styles.ko_cell, styles.ko_cell_full]}>
                  <KoEmpty />
                </View>
              </View>
            );
          }
          return (
            <View key={round.label} style={styles.bracket_panel}>
              <View style={styles.bracket_chip}>
                <Text style={styles.bracket_chip_label}>{round.label}</Text>
              </View>
              <View style={styles.ko_grid}>
                {round.fixtures.map((fx, i) => (
                  <View
                    key={fx ? fx.id : `${round.label}-${i}`}
                    style={[styles.ko_cell, single && styles.ko_cell_full]}
                  >
                    {fx ? <CompactCell fixture={fx} on_open={on_open} /> : <KoEmpty />}
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

// Placeholder slot for a knockout match that doesn't exist yet (skeleton).
function KoEmpty() {
  return (
    <View style={styles.ko_empty}>
      <Text style={styles.ko_empty_txt}>TBD</Text>
    </View>
  );
}

function CompactCell({ fixture, on_open }: { fixture: Fixture; on_open: (id: number) => void }) {
  const home = teams_api.get(fixture.home_team_id);
  const away = teams_api.get(fixture.away_team_id);
  const is_live = fixture.status === "live";
  const is_today = fixture.date ? fixture.date.slice(0, 10) === today_key() : false;
  const finished = fixture.status === "finished";
  const played = finished || is_live;
  const time = format_kickoff_time(fixture.date);
  const day = fixture.date
    ? new Date(fixture.date).toLocaleDateString(undefined, { day: "2-digit", month: "short" }).toUpperCase()
    : "";
  const datetime = [day, time].filter(Boolean).join(" · ") || "TBD";
  return (
    <Pressable style={[styles.cc, is_today && styles.cc_today, is_live && styles.cc_live]} onPress={() => on_open(fixture.id)}>
      {/* Narrow bracket columns: show the ISO-3 code (core.team.id, a real
          provider value) instead of the truncated full name — matches web. */}
      <CellTeamRow flag={home?.flag} code={fixture.home_team_id} score={fixture.home_score} played={played} />
      <CellTeamRow flag={away?.flag} code={fixture.away_team_id} score={fixture.away_score} played={played} />
      <View style={styles.cc_foot}>
        {is_live ? (
          <>
            <View style={styles.cc_live_dot} />
            <Text style={styles.cc_live_txt}>LIVE</Text>
          </>
        ) : finished ? (
          <Text style={styles.cc_ft}>FT</Text>
        ) : (
          <Text style={[styles.cc_foot_time, is_today && styles.cc_foot_time_today]}>{datetime}</Text>
        )}
      </View>
    </Pressable>
  );
}

function CellTeamRow({ flag, code, score, played }: { flag?: string; code: string; score?: number; played: boolean }) {
  const value = played ? (score ?? 0) : "-";
  return (
    <View style={styles.cc_row}>
      <Text style={styles.cc_flag}>{flag ?? ""}</Text>
      <Text style={styles.cc_code} numberOfLines={1}>{code}</Text>
      <View style={styles.cc_score_slot}>
        <Text style={[styles.cc_score, !played && styles.cc_score_off]}>{value}</Text>
      </View>
    </View>
  );
}

// FinalCard — the WC2026 final, given a dedicated large card per the redesign:
// big centred score, flags + 3-letter codes on each side, trophy + winner name,
// and the fixture note (e.g. "after extra time") when present.
function FinalCard({ fixture, on_open }: { fixture: Fixture; on_open: (id: number) => void }) {
  const home = teams_api.get(fixture.home_team_id);
  const away = teams_api.get(fixture.away_team_id);
  if (!home || !away) return null;
  const is_live = fixture.status === "live";
  const finished = fixture.status === "finished";
  const played = finished || is_live;
  const home_win = finished && (fixture.home_score ?? 0) > (fixture.away_score ?? 0);
  const away_win = finished && (fixture.away_score ?? 0) > (fixture.home_score ?? 0);
  const winner = home_win ? home : away_win ? away : null;

  return (
    <Pressable style={styles.final_card} onPress={() => on_open(fixture.id)}>
      <View style={styles.final_head}>
        <Text style={styles.final_head_txt}>FINAL</Text>
      </View>
      <View style={styles.final_body}>
        <View style={styles.final_side}>
          <Text style={[styles.final_code, home_win && styles.final_code_win]} numberOfLines={1}>{home.name}</Text>
          <Text style={styles.final_flag}>{home.flag}</Text>
        </View>
        <View style={styles.final_center}>
          {played ? (
            <Text style={styles.final_score}>{fixture.home_score ?? 0} - {fixture.away_score ?? 0}</Text>
          ) : (
            <Text style={styles.final_vs}>VS</Text>
          )}
        </View>
        <View style={styles.final_side_r}>
          <Text style={styles.final_flag}>{away.flag}</Text>
          <Text style={[styles.final_code, away_win && styles.final_code_win]} numberOfLines={1}>{away.name}</Text>
        </View>
      </View>
      {winner ? (
        <View style={styles.final_winner}>
          <Text style={styles.final_trophy}>🏆</Text>
          <Text style={styles.final_winner_txt}>{winner.name}</Text>
        </View>
      ) : null}
      {fixture.note ? <Text style={styles.final_note}>* {fixture.note}</Text> : null}
    </Pressable>
  );
}

// ── Groups (standings tables) ──────────────────────────────────────────
function GroupsView() {
  const router = useRouter();
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
        <View key={g.group} style={styles.std_card}>
          <View style={styles.std_group_head}>
            <Text style={styles.std_group_letter}>Group {g.group}</Text>
          </View>
          <View style={[styles.std_row, styles.std_head]}>
            <Text style={[styles.std_pos, styles.std_h]}>#</Text>
            <Text style={[styles.std_team, styles.std_h]}>Team</Text>
            <Text style={[styles.std_num, styles.std_h]}>P</Text>
            <Text style={[styles.std_num, styles.std_h]}>W</Text>
            <Text style={[styles.std_num, styles.std_h]}>D</Text>
            <Text style={[styles.std_num, styles.std_h]}>L</Text>
            <Text style={[styles.std_gd, styles.std_h]}>GD</Text>
            <Text style={[styles.std_pts_h, styles.std_h]}>Pts</Text>
          </View>
          {g.rows.map(r => {
            const q = r.position <= 2;
            return (
              <Pressable key={r.team_id} style={[styles.std_row, q && styles.std_row_q]} onPress={() => router.push(`/team/${r.team_id}`)}>
                <Text style={[styles.std_pos, { color: q ? palette.brandBlue : text.tertiary }]}>{r.position}</Text>
                <View style={styles.std_team_cell}>
                  {r.flag ? <Image source={{ uri: r.flag }} style={styles.std_flag} resizeMode="contain" /> : <View style={styles.std_flag} />}
                  <Text style={[styles.std_name, q && styles.std_name_q]} numberOfLines={1}>{r.team_name}</Text>
                </View>
                <Text style={[styles.std_num, styles.std_dim]}>{r.played}</Text>
                <Text style={[styles.std_num, styles.std_dim]}>{r.won}</Text>
                <Text style={[styles.std_num, styles.std_dim]}>{r.drawn}</Text>
                <Text style={[styles.std_num, styles.std_dim]}>{r.lost}</Text>
                <Text style={styles.std_gd}>{r.goal_difference > 0 ? "+" : ""}{r.goal_difference}</Text>
                <View style={styles.std_pts_col}>
                  <View style={styles.pts_badge}>
                    <Text style={styles.pts_txt}>{r.points}</Text>
                  </View>
                </View>
              </Pressable>
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },

  // Primary nav — status filter pills (rounded, free-floating row).
  status_tabs: { flexDirection: "row", gap: 8, paddingRight: 8 },
  status_tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.025)" },
  status_tab_on: { backgroundColor: with_alpha(palette.accentBlue, 0.22), borderColor: with_alpha(palette.accentBlue, 0.60) },
  status_tab_label: { fontSize: 12.5, fontWeight: "600", color: text.secondary },
  status_tab_label_on: { color: "#fff", fontWeight: "800" },
  disabled: { opacity: 0.35 },

  // Secondary nav — view switch (boxed segmented control, full width).
  view_switch: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 10, padding: 3, gap: 3 },
  view_btn: { flex: 1, paddingVertical: 8, borderRadius: 7, alignItems: "center" },
  view_btn_on: { backgroundColor: palette.brandBlue },
  view_btn_label: { fontSize: 12, fontWeight: "700", color: text.secondary, letterSpacing: 0.4 },
  view_btn_label_on: { color: "#fff" },

  scroll: { padding: 16, paddingTop: 14, paddingBottom: 32 },
  empty: { padding: 40, textAlign: "center", color: text.muted, fontSize: 13 },

  day: { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" },
  day_today: { borderColor: with_alpha(palette.positive, 0.30) },
  day_head: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.05)", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  day_head_today: { backgroundColor: with_alpha(palette.positive, 0.08), borderBottomColor: with_alpha(palette.positive, 0.22) },
  day_weekday: { fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: text.tertiary },
  day_weekday_today: { color: palette.brandGreen },
  day_date: { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: -0.2 },
  today_badge: { backgroundColor: palette.brandGreen, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  today_badge_label: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: "#0d0d0f" },
  day_count: { fontSize: 11, color: text.tertiary, fontWeight: "600" },
  day_body: { padding: 10, gap: 8 },

  fx_card: { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  fx_card_live: { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.14)" },
  fx_top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 },
  fx_top_left: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 },
  ft: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  ft_label: { fontSize: 10.5, fontWeight: "800", color: text.secondary, letterSpacing: 0.4 },
  upcoming: { fontSize: 10.5, color: text.tertiary, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase" },
  phase: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  phase_label: { fontSize: 9.5, color: text.tertiary, fontWeight: "700", letterSpacing: 0.5 },
  held: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: with_alpha(palette.positive, 0.10), borderWidth: 1, borderColor: with_alpha(palette.positive, 0.28), borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2, flexShrink: 1 },
  held_dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.positive },
  held_label: { fontSize: 10, fontWeight: "700", color: palette.positive, flexShrink: 1 },
  fx_time: { fontFamily: mono, fontSize: 11, color: text.tertiary, fontWeight: "600" },
  fx_teams: { flexDirection: "row", alignItems: "center", gap: 10 },
  fx_team_right: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 9 },
  fx_team_left: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  fx_team_name: { fontSize: 13, fontWeight: "700", color: "#fff", flexShrink: 1 },
  fx_flag: { fontSize: 23 },
  fx_score: { fontFamily: mono, fontSize: 23, fontWeight: "900", minWidth: 54, textAlign: "center", color: "#fff", letterSpacing: -1 },
  fx_vs: { fontFamily: mono, fontSize: 12, color: text.faint, fontWeight: "700", minWidth: 54, textAlign: "center" },
  fx_venue: { textAlign: "center", fontSize: 10.5, color: text.tertiary, marginTop: 9 },

  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  divider_line: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.07)" },
  divider_label: { fontSize: 11, letterSpacing: 1.4, fontWeight: "800", color: text.secondary },

  group_grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bracket_panel: { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, flexGrow: 1, flexBasis: "47%", gap: 8 },
  bracket_chip: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8, alignItems: "center" },
  bracket_chip_label: { fontSize: 10, letterSpacing: 1.4, fontWeight: "800", color: "rgba(255,255,255,0.82)" },
  ko_grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ko_cell: { flexGrow: 1, flexBasis: "47%" },
  ko_cell_full: { flexBasis: "100%" },
  ko_empty: { minHeight: 52, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.10)", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  ko_empty_txt: { color: "rgba(255,255,255,0.25)", fontSize: 11, fontWeight: "700", letterSpacing: 1 },

  cc: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, gap: 4 },
  cc_today: { borderColor: with_alpha(palette.positive, 0.40), borderLeftWidth: 3, borderLeftColor: palette.brandGreen },
  cc_live: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.18)" },
  cc_row: { flexDirection: "row", alignItems: "center", gap: 7 },
  cc_flag: { fontSize: 16, width: 22, textAlign: "center" },
  cc_code: { flex: 1, fontWeight: "700", fontSize: 11.5, color: "rgba(255,255,255,0.55)" },
  cc_code_win: { color: "#fff", fontWeight: "800" },
  cc_score_slot: { width: 24, alignItems: "flex-end" },
  cc_score: { fontFamily: mono, fontSize: 13, fontWeight: "800", color: "rgba(255,255,255,0.55)", textAlign: "right" },
  cc_score_off: { color: text.muted },
  cc_win_badge: { backgroundColor: palette.brandBlue, borderRadius: 5, minWidth: 20, paddingHorizontal: 5, paddingVertical: 1, alignItems: "center" },
  cc_win_txt: { fontFamily: mono, fontSize: 12, fontWeight: "900", color: "#fff" },
  cc_foot: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 1 },
  cc_foot_time: { fontFamily: mono, fontSize: 9.5, color: text.tertiary, fontWeight: "700" },
  cc_foot_time_today: { color: palette.brandGreen },
  cc_ft: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6, color: text.tertiary },
  cc_live_dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.brandGreen },
  cc_live_txt: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6, color: palette.brandGreen },

  final_card: { backgroundColor: with_alpha(palette.accentBlue, 0.08), borderWidth: 1, borderColor: with_alpha(palette.accentBlue, 0.45), borderRadius: 12, overflow: "hidden" },
  final_head: { backgroundColor: palette.brandBlue, paddingVertical: 6, alignItems: "center" },
  final_head_txt: { fontSize: 10, letterSpacing: 1.6, fontWeight: "800", color: "#fff" },
  final_body: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 10 },
  final_side: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10 },
  final_side_r: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  final_code: { fontSize: 15, fontWeight: "700", color: "rgba(255,255,255,0.7)", flexShrink: 1 },
  final_code_win: { color: "#fff", fontWeight: "800" },
  final_flag: { fontSize: 30 },
  final_center: { paddingHorizontal: 4 },
  final_score: { fontFamily: mono, fontSize: 30, fontWeight: "900", color: "#fff", letterSpacing: -1 },
  final_vs: { fontFamily: mono, fontSize: 16, color: text.faint, fontWeight: "700" },
  final_winner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingBottom: 14 },
  final_trophy: { fontSize: 15 },
  final_winner_txt: { fontSize: 13, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", color: "#fff" },
  final_note: { textAlign: "center", fontSize: 10, color: text.tertiary, fontStyle: "italic", paddingBottom: 12 },

  std_card: { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" },
  std_group_head: { paddingLeft: 15, paddingRight: 12, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.05)", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  std_group_letter: { fontSize: 12.5, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase", color: "#fff" },
  std_row: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" },
  std_head: { borderTopWidth: 0, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.015)" },
  std_row_q: { backgroundColor: with_alpha(palette.accentBlue, 0.10) },
  std_h: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase", color: text.tertiary },
  std_pos: { fontFamily: mono, width: 22, textAlign: "center", fontWeight: "800", fontSize: 12 },
  std_team: { flex: 1 },
  std_team_cell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  std_flag: { width: 18, height: 18, borderRadius: 3 },
  std_name: { fontSize: 12.5, fontWeight: "600", color: "rgba(255,255,255,0.85)", flexShrink: 1 },
  std_name_q: { fontWeight: "700", color: "#fff" },
  std_num: { fontFamily: mono, width: 22, textAlign: "center", fontSize: 12, color: text.secondary },
  std_dim: { color: text.tertiary },
  std_gd: { fontFamily: mono, width: 34, textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: "600" },
  std_pts_h: { fontFamily: mono, width: 40, textAlign: "right" },
  std_pts_col: { width: 40, alignItems: "flex-end" },
  pts_badge: { minWidth: 26, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: with_alpha(palette.accentBlue, 0.18), alignItems: "center" },
  pts_badge_q: { backgroundColor: palette.brandBlue },
  pts_txt: { fontFamily: mono, fontSize: 13, fontWeight: "900", color: "rgba(255,255,255,0.8)" },
  pts_txt_q: { color: "#fff" },
});
