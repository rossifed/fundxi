// TeamPage — per-team hub (pushed screen). RN port of
// apps/web/src/ui/pages/team/TeamPage.tsx, adapted to a single scrollable
// column: header (identity + group placing + coach), tournament record,
// squad summary, squad grouped by position (tap → player sheet), and the
// team's fixtures (tap → match). Every value is real provider data already
// in the DB — nothing synthesised. The desktop flip PlayerCard + quick-trade
// are dropped (trading is gated on mobile); squad rows mirror the screener.
//
// Live: squad prices on the prices topic, record on standings, fixtures on
// matches — same streams the web page subscribes to.

import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { matches_api } from "@fundxi/core/api/matches_api";
import { players_api } from "@fundxi/core/api/players_api";
import { standings_api, type StandingRow } from "@fundxi/core/api/standings_api";
import { teams_api, type SquadPlayer } from "@fundxi/core/api/teams_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import type { Fixture } from "@fundxi/core/domain/match/fixture";
import { type Player, type Position } from "@fundxi/core/domain/player/player";

import { PlayerChip } from "@/components/PlayerChip";
import { PlayerSheet, type PlayerSheetHandle } from "@/components/PlayerSheet";
import { TickValue } from "@/components/TickValue";
import { useLiveRefetch, useMatchesLiveVersion, usePricesLiveVersion, useStandingsLiveVersion } from "@/components/live";
import { color_for_sign, fmt_eur_m, fmt_signed_pct } from "@/lib/format";
import { mono, palette, position_color, text } from "@/theme/tokens";

const POSITION_GROUPS: { key: Position; label: string }[] = [
  { key: "GK", label: "Goalkeepers" },
  { key: "DF", label: "Defenders" },
  { key: "MF", label: "Midfielders" },
  { key: "FW", label: "Forwards" },
];

function fmt_match_date(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function fmt_squad_value(value_m: number): string {
  return value_m >= 1000 ? `€${(value_m / 1000).toFixed(2)}B` : `€${Math.round(value_m)}M`;
}

function last_word(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

// Resolve the full domain Player when the squad member is in the cached
// universe; otherwise build a minimal Player from the squad row so the sheet
// can still open and fetch stats/news/matches by id. All extra Player fields
// are optional, so this is a faithful (not synthesised) projection.
function to_player(sp: SquadPlayer, team_id: string): Player {
  return (
    players_api.get(sp.id) ?? {
      id: sp.id,
      name: sp.name,
      jersey_number: sp.jersey_number,
      team_id,
      position: sp.position as Position,
      full_name: sp.full_name ?? undefined,
      image_path: sp.image_path ?? undefined,
      detailed_position: sp.detailed_position ?? undefined,
      age: sp.age ?? undefined,
      height: sp.height != null ? String(sp.height) : undefined,
      weight: sp.weight != null ? String(sp.weight) : undefined,
    }
  );
}

export default function TeamScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ team_id: string }>();
  const team_id = String(params.team_id);
  const team = teams_api.get(team_id);
  const sheet_ref = useRef<PlayerSheetHandle>(null);

  const prices_version = usePricesLiveVersion();
  const standings_version = useStandingsLiveVersion();
  const [fixtures_version, set_fixtures_version] = useState(0);
  useLiveRefetch(useMatchesLiveVersion(), () => {
    void matches_api.refresh_fixtures().then(() => set_fixtures_version(v => v + 1));
  });
  useLiveRefetch(prices_version, () => {
    void valuations_api.refresh().then(() => set_fixtures_version(v => v + 1));
  });

  const [squad, set_squad] = useState<SquadPlayer[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void teams_api.fetch_squad(team_id).then(players => !cancelled && set_squad(players));
    return () => {
      cancelled = true;
    };
  }, [team_id]);

  const [standing, set_standing] = useState<StandingRow | null>(null);
  const [team_group, set_team_group] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void standings_api.list().then(groups => {
      if (cancelled) return;
      for (const g of groups) {
        const row = g.rows.find(r => r.team_id === team_id);
        if (row) {
          set_standing(row);
          set_team_group(g.group);
          return;
        }
      }
      set_standing(null);
      set_team_group(null);
    });
    return () => {
      cancelled = true;
    };
  }, [team_id, standings_version]);

  const fixtures = useMemo(
    () =>
      matches_api
        .list_fixtures()
        .filter(f => f.home_team_id === team_id || f.away_team_id === team_id)
        .slice()
        .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
    [team_id, fixtures_version],
  );

  const open_fixture = async (fx: Fixture) => {
    router.push(`/match/${fx.id}`);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.back} onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back_label}>← Back</Text>
        </Pressable>

        {!team ? (
          <Text style={styles.loading}>Team not found.</Text>
        ) : (
          <View style={{ gap: 16 }}>
            <TeamHeader team_id={team_id} standing={standing} group={team_group} />
            {standing && <RecordStrip standing={standing} />}
            {squad && squad.length > 0 && <SquadSummary squad={squad} />}

            {/* Squad */}
            <View style={{ gap: 12 }}>
              <Text style={styles.section_label}>Squad{squad ? ` · ${squad.length}` : ""}</Text>
              {squad === null ? (
                <Text style={styles.muted}>Loading squad…</Text>
              ) : squad.length === 0 ? (
                <Text style={styles.muted}>No players found for this team.</Text>
              ) : (
                POSITION_GROUPS.map(grp => {
                  const players = squad.filter(p => p.position === grp.key);
                  if (players.length === 0) return null;
                  const accent = position_color[grp.key];
                  return (
                    <View key={grp.key} style={styles.group_panel}>
                      <View style={[styles.group_head, { backgroundColor: `${accent}16`, borderBottomColor: `${accent}33` }]}>
                        <View style={[styles.group_dot, { backgroundColor: accent }]} />
                        <Text style={styles.group_label}>{grp.label}</Text>
                        <Text style={styles.group_count}>{players.length}</Text>
                      </View>
                      <View style={{ padding: 8, gap: 6 }}>
                        {players.map(p => (
                          <SquadRow key={p.id} p={p} team_color={team.color} on_open={() => sheet_ref.current?.open(to_player(p, team_id))} />
                        ))}
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* Fixtures */}
            <View style={{ gap: 8 }}>
              <Text style={styles.section_label}>Fixtures · {fixtures.length}</Text>
              {fixtures.length === 0 ? (
                <Text style={styles.muted}>No fixtures for this team.</Text>
              ) : (
                fixtures.map(fx => (
                  <TeamFixtureRow key={fx.id} fixture={fx} team_id={team_id} on_open={() => void open_fixture(fx)} />
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>
      <PlayerSheet ref={sheet_ref} />
    </View>
  );
}

function TeamHeader({ team_id, standing, group }: { team_id: string; standing: StandingRow | null; group: string | null }) {
  const team = teams_api.get(team_id);
  if (!team) return null;
  const sub: string[] = [];
  if (team.continent) sub.push(team.continent);
  if (group) sub.push(`Group ${group}`);
  if (standing) sub.push(`${ordinal(standing.position)} in group`);
  return (
    <View style={styles.header}>
      {team.flag_url ? (
        <Image source={{ uri: team.flag_url }} style={styles.header_flag_img} resizeMode="contain" />
      ) : (
        <Text style={styles.header_flag}>{team.flag}</Text>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.header_name} numberOfLines={1}>{team.name}</Text>
        {sub.length > 0 && <Text style={styles.header_sub}>{sub.join(" · ")}</Text>}
        {team.coach_name && (
          <View style={styles.coach_row}>
            {team.coach_image_path && <Image source={{ uri: team.coach_image_path }} style={styles.coach_img} />}
            <Text style={styles.coach_text}>
              <Text style={styles.coach_kicker}>COACH </Text>
              {team.coach_name}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function RecordStrip({ standing }: { standing: StandingRow }) {
  const cells: { label: string; value: string | number; color?: string; emphasis?: boolean }[] = [
    { label: "Played", value: standing.played },
    { label: "Won", value: standing.won },
    { label: "Drawn", value: standing.drawn },
    { label: "Lost", value: standing.lost },
    { label: "GF", value: standing.goals_for },
    { label: "GA", value: standing.goals_against },
    { label: "GD", value: `${standing.goal_difference > 0 ? "+" : ""}${standing.goal_difference}`, color: color_for_sign(standing.goal_difference) },
    { label: "Points", value: standing.points, emphasis: true },
  ];
  return (
    <View style={styles.record}>
      {cells.map(c => (
        <View key={c.label} style={styles.record_cell}>
          <Text style={styles.record_label}>{c.label}</Text>
          <Text style={[styles.record_value, c.emphasis && { fontSize: 18 }, c.color ? { color: c.color } : null]}>{c.value}</Text>
        </View>
      ))}
    </View>
  );
}

function SquadSummary({ squad }: { squad: SquadPlayer[] }) {
  const total_value = squad.reduce((s, p) => s + p.valuation.current_price, 0);
  const ages = squad.map(p => p.age).filter((a): a is number => a != null);
  const avg_age = ages.length > 0 ? ages.reduce((s, a) => s + a, 0) / ages.length : null;
  let top_scorer: SquadPlayer | null = null;
  for (const p of squad) if ((p.stats?.goals ?? 0) > (top_scorer?.stats?.goals ?? 0)) top_scorer = p;
  const top_goals = top_scorer?.stats?.goals ?? 0;
  let top_value: SquadPlayer | null = null;
  for (const p of squad) if (p.valuation.current_price > (top_value?.valuation.current_price ?? -Infinity)) top_value = p;
  const cells = [
    { label: "Squad value", main: fmt_squad_value(total_value) },
    { label: "Avg age", main: avg_age != null ? avg_age.toFixed(1) : "—" },
    { label: "Top scorer", main: top_goals > 0 && top_scorer ? last_word(top_scorer.name) : "—", sub: top_goals > 0 ? `${top_goals} ${top_goals === 1 ? "goal" : "goals"}` : undefined },
    { label: "Top value", main: top_value ? last_word(top_value.name) : "—", sub: top_value ? fmt_eur_m(top_value.valuation.current_price) : undefined },
  ];
  return (
    <View style={styles.summary}>
      {cells.map(c => (
        <View key={c.label} style={styles.summary_cell}>
          <Text style={styles.summary_label}>{c.label}</Text>
          <Text style={styles.summary_main} numberOfLines={1}>{c.main}</Text>
          {c.sub && <Text style={styles.summary_sub}>{c.sub}</Text>}
        </View>
      ))}
    </View>
  );
}

function SquadRow({ p, team_color, on_open }: { p: SquadPlayer; team_color: string; on_open: () => void }) {
  const live = valuations_api.get_for_player(p.id);
  const price = live?.current_price ?? p.valuation.current_price;
  const change = live?.change_since_inception ?? p.valuation.change_since_inception;
  return (
    <Pressable style={styles.row} onPress={on_open}>
      <View style={styles.row_avatar_wrap}>
        {p.image_path ? (
          <Image source={{ uri: p.image_path }} style={styles.row_avatar} resizeMode="cover" />
        ) : (
          <PlayerChip jersey_number={p.jersey_number} team_color={team_color} size={34} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.row_name} numberOfLines={1}>{p.name}</Text>
        <Text style={styles.row_jersey}>#{p.jersey_number}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <TickValue value={price}>
          <Text style={styles.row_price}>{fmt_eur_m(price)}</Text>
        </TickValue>
        <Text style={[styles.row_change, { color: color_for_sign(change) }]}>{fmt_signed_pct(change, 1)}</Text>
      </View>
    </Pressable>
  );
}

function TeamFixtureRow({ fixture, team_id, on_open }: { fixture: Fixture; team_id: string; on_open: () => void }) {
  const router = useRouter();
  const is_home = fixture.home_team_id === team_id;
  const opponent_id = is_home ? fixture.away_team_id : fixture.home_team_id;
  const opponent = teams_api.get(opponent_id);
  const is_played = fixture.status === "finished" || fixture.status === "live";
  const own = is_home ? fixture.home_score : fixture.away_score;
  const opp = is_home ? fixture.away_score : fixture.home_score;
  const time = fixture.date ? new Date(fixture.date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
  const status_label = fixture.status === "live" ? "LIVE" : fixture.status === "finished" ? "FT" : "UPCOMING";
  const status_color = fixture.status === "live" ? palette.positive : text.tertiary;
  return (
    <Pressable style={styles.fx} onPress={on_open}>
      <Text style={styles.fx_date}>{fmt_match_date(fixture.date)}</Text>
      <Text style={styles.fx_vs}>{is_home ? "vs" : "@"}</Text>
      <Pressable style={styles.fx_opp} hitSlop={4} onPress={() => router.push(`/team/${opponent_id}`)}>
        <Text style={styles.fx_flag}>{opponent?.flag ?? ""}</Text>
        <Text style={styles.fx_opp_name} numberOfLines={1}>{opponent?.name ?? opponent_id}</Text>
      </Pressable>
      <Text style={[styles.fx_score, { color: is_played ? "#fff" : text.tertiary }]}>
        {is_played ? `${own ?? 0} – ${opp ?? 0}` : time || "—"}
      </Text>
      <Text style={[styles.fx_status, { color: status_color }]}>{status_label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { padding: 16, paddingTop: 12, gap: 16 },
  back: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 12 },
  back_label: { color: text.secondary, fontSize: 12, fontWeight: "600" },
  loading: { color: text.tertiary, fontSize: 13, textAlign: "center", paddingVertical: 60 },
  muted: { color: text.muted, fontSize: 13, textAlign: "center", paddingVertical: 24 },
  section_label: { fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", color: text.secondary },

  header: { flexDirection: "row", alignItems: "center", gap: 16, padding: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.02)" },
  header_flag: { fontSize: 46, lineHeight: 52 },
  header_flag_img: { width: 52, height: 52 },
  header_name: { fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: -0.4 },
  header_sub: { fontSize: 12, color: text.secondary, fontWeight: "600", marginTop: 2 },
  coach_row: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 8 },
  coach_img: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  coach_text: { fontSize: 12, fontWeight: "600", color: text.secondary },
  coach_kicker: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8, color: text.tertiary },

  record: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)", gap: 1 },
  record_cell: { flexGrow: 1, flexBasis: "23%", backgroundColor: "rgba(13,13,15,0.6)", paddingVertical: 12, paddingHorizontal: 8, alignItems: "center" },
  record_label: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", color: text.tertiary },
  record_value: { fontFamily: mono, fontSize: 16, fontWeight: "800", color: "#fff", marginTop: 3 },

  summary: { flexDirection: "row", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)", gap: 1 },
  summary_cell: { flex: 1, backgroundColor: "rgba(13,13,15,0.6)", paddingVertical: 11, paddingHorizontal: 6, alignItems: "center", minWidth: 0 },
  summary_label: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", color: text.tertiary, textAlign: "center" },
  summary_main: { fontFamily: mono, fontSize: 15, fontWeight: "800", color: "#fff", marginTop: 3 },
  summary_sub: { fontSize: 9.5, fontWeight: "600", color: text.tertiary, marginTop: 1 },

  group_panel: { backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" },
  group_head: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  group_dot: { width: 9, height: 9, borderRadius: 5 },
  group_label: { fontSize: 13, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", color: "#fff", flex: 1 },
  group_count: { fontSize: 11, fontWeight: "800", color: text.secondary, backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },

  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, backgroundColor: "rgba(255,255,255,0.025)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 10 },
  row_avatar_wrap: { width: 34, height: 34 },
  row_avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.06)" },
  row_name: { fontSize: 13, fontWeight: "700", color: "#fff" },
  row_jersey: { fontFamily: mono, fontSize: 11, fontWeight: "700", color: text.tertiary, marginTop: 1 },
  row_price: { fontFamily: mono, fontSize: 13, fontWeight: "800", color: "#fff" },
  row_change: { fontFamily: mono, fontSize: 11, fontWeight: "700", marginTop: 1 },

  fx: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 8 },
  fx_date: { fontFamily: mono, fontSize: 12, color: text.secondary, width: 56 },
  fx_vs: { fontSize: 10, color: text.tertiary, fontWeight: "700", width: 20 },
  fx_opp: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7, minWidth: 0 },
  fx_flag: { fontSize: 16 },
  fx_opp_name: { fontSize: 13, fontWeight: "700", color: "#fff", flexShrink: 1 },
  fx_score: { fontFamily: mono, fontSize: 13, fontWeight: "800", width: 56, textAlign: "center" },
  fx_status: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4, width: 60, textAlign: "right" },
});
