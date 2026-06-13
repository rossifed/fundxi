import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { matches_api } from "@fundxi/core/api/matches_api";
import { players_api } from "@fundxi/core/api/players_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { news_api } from "@fundxi/core/api/news_api";
import { leagues_api } from "@fundxi/core/api/leagues_api";
import { compute_return_pct } from "@fundxi/core/domain/market/return";
import { compute_initials } from "@fundxi/core/domain/identity/avatar";
import { spark_for_player } from "@fundxi/core/infrastructure/repositories/valuations_repository";
import { themes } from "@fundxi/core/design/palette";
import type { PlayerWithValuation } from "@fundxi/core/domain/market/player_valuation";
import type { Fixture } from "@fundxi/core/domain/match/fixture";
import type { News } from "@fundxi/core/domain/news/news";

import { Spark } from "@/components/Spark";
import { useMatchesLiveVersion, usePricesLiveVersion } from "@/components/live";
import { useRefresh } from "@/components/use_refresh";
import { PlayerSheet, type PlayerSheetHandle } from "@/components/PlayerSheet";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/components/AuthContext";
import { useWatchlist } from "@/lib/watchlist";
import { mono, surface, text, with_alpha } from "@/theme/tokens";

const palette = themes.dark;

export default function HomeScreen() {
  const router = useRouter();
  const sheet_ref = useRef<PlayerSheetHandle>(null);
  const open_player = (player: PlayerWithValuation) => sheet_ref.current?.open(player);

  const matches_version = useMatchesLiveVersion();
  const [refresh_tag, set_refresh_tag] = useState(0);

  useEffect(() => {
    if (matches_version === 0) return;
    void matches_api.refresh_fixtures().then(() => set_refresh_tag(t => t + 1));
  }, [matches_version]);

  const { refreshing, onRefresh } = useRefresh(() =>
    matches_api.refresh_fixtures().then(() => set_refresh_tag(t => t + 1)),
  );

  const next_fx = useMemo(
    () =>
      matches_api
        .list_fixtures()
        .filter(f => f.status === "upcoming")
        .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))[0],
    [refresh_tag],
  );
  const live_fx = useMemo(
    () => matches_api.list_fixtures().find(f => f.status === "live"),
    [refresh_tag],
  );
  const top_up = useMemo(() => players_api.top_movers(5, "up"), [refresh_tag]);
  const top_down = useMemo(() => players_api.top_movers(5, "down"), [refresh_tag]);
  const news = useMemo(() => news_api.list().slice(0, 20), [refresh_tag]);

  const watched_ids = useWatchlist();
  const prices_version = usePricesLiveVersion();
  const watched = useMemo(
    () => players_api.search({}).filter(p => watched_ids.has(p.id)),
    [watched_ids, refresh_tag, prices_version],
  );

  const [movers_dir, set_movers_dir] = useState<"up" | "down">("up");

  const { status: auth_status } = useAuth();
  useEffect(() => {
    if (auth_status === "authenticated") {
      void leagues_api.refresh().then(() => set_refresh_tag(t => t + 1)).catch(() => {});
    }
  }, [auth_status, prices_version]);
  const my_leagues = useMemo(() => leagues_api.list_summaries(), [auth_status, refresh_tag]);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scroll_content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        <Logo size={30} tagline style={styles.hero} />

        <SectionCard>
          <SectionHeader title="Match Center" cta="All fixtures →" on_cta={() => router.push("/fixtures")} />
          {live_fx ? (
            <LiveMatchCard fixture={live_fx} on_open={() => router.push(`/match/${live_fx.id}`)} />
          ) : next_fx ? (
            <NextMatchCard fixture={next_fx} on_open={() => router.push(`/match/${next_fx.id}`)} />
          ) : (
            <EmptyMatchRow on_press={() => router.push("/fixtures")} />
          )}
        </SectionCard>

        {auth_status === "authenticated" && my_leagues.length > 0 && (
          <SectionCard>
            <SectionHeader title="Your leagues" cta="See all →" on_cta={() => router.push("/leagues")} />
            {my_leagues.map((l, i) => (
              <Pressable
                key={l.id}
                style={[styles.league_row, i > 0 && styles.row_divider]}
                onPress={() => router.push("/leagues")}
              >
                <View style={styles.league_badge}>
                  <Text style={styles.league_badge_text}>{compute_initials(l.name)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.league_name} numberOfLines={1}>{l.name}</Text>
                  <Text style={styles.league_meta}>{l.member_count} members</Text>
                </View>
                <View style={styles.league_stats}>
                  <Text style={styles.league_rank}>#{l.my_rank}</Text>
                  <Text style={[styles.league_return, { color: l.my_return_pct >= 0 ? palette.positive : palette.negative }]}>
                    {l.my_return_pct >= 0 ? "+" : ""}{l.my_return_pct}%
                  </Text>
                </View>
              </Pressable>
            ))}
          </SectionCard>
        )}

        <SectionCard>
          <SectionHeader title="Top movers" cta="Open screener →" on_cta={() => router.push("/screener")} />
          <View style={styles.movers_toggle}>
            {([["up", "Gainers"], ["down", "Losers"]] as const).map(([d, label]) => {
              const on = movers_dir === d;
              return (
                <Pressable key={d} onPress={() => set_movers_dir(d)} style={[styles.mtoggle, on && styles.mtoggle_on]}>
                  <Text style={[styles.mtoggle_label, on && styles.mtoggle_label_on]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {(movers_dir === "up" ? top_up : top_down).map((p, i) => (
            <MoverRow key={p.id} player={p} rank={i + 1} divider={i > 0} on_open={open_player} />
          ))}
        </SectionCard>

        {watched.length > 0 && (
          <SectionCard>
            <SectionHeader title="Watchlist" meta={`${watched.length} ★`} />
            {watched.map((p, i) => (
              <MoverRow key={p.id} player={p} divider={i > 0} on_open={open_player} />
            ))}
          </SectionCard>
        )}

        <SectionCard>
          <SectionHeader title="Market news" meta="Today" />
          {news.length === 0 ? (
            <Text style={styles.empty}>No news right now.</Text>
          ) : (
            news.map((n, i) => <NewsRow key={n.id} item={n} divider={i > 0} />)
          )}
        </SectionCard>
      </ScrollView>

      <PlayerSheet ref={sheet_ref} />
    </View>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function SectionHeader({
  title,
  cta,
  on_cta,
  meta,
}: {
  title: string;
  cta?: string;
  on_cta?: () => void;
  meta?: string;
}) {
  return (
    <View style={styles.section_header}>
      <Text style={styles.section_title} numberOfLines={1}>{title}</Text>
      {cta && on_cta && (
        <Pressable onPress={on_cta} style={styles.cta_btn} hitSlop={8}>
          <Text style={styles.cta}>{cta}</Text>
        </Pressable>
      )}
      {meta && <Text style={styles.meta}>{meta}</Text>}
    </View>
  );
}

function fmt_kickoff(iso?: string): string {
  if (!iso) return "Date TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmt_venue(fixture: Fixture): string {
  return [fixture.venue_name, fixture.venue_city].filter(Boolean).join(", ");
}

function EmptyMatchRow({ on_press }: { on_press: () => void }) {
  return (
    <Pressable style={styles.empty_match} onPress={on_press} accessibilityRole="button" accessibilityLabel="View fixtures">
      <Text style={styles.empty_match_text}>No upcoming fixtures</Text>
      <View style={styles.view_fixtures}>
        <Text style={styles.view_fixtures_text}>View fixtures →</Text>
      </View>
    </Pressable>
  );
}

function NextMatchCard({ fixture, on_open }: { fixture: Fixture; on_open: () => void }) {
  const home = teams_api.get(fixture.home_team_id);
  const away = teams_api.get(fixture.away_team_id);
  const venue = fmt_venue(fixture);
  return (
    <Pressable style={styles.next_card} onPress={on_open} accessibilityRole="button" accessibilityLabel="Open next match">
      <Text style={styles.next_kicker}>NEXT MATCH</Text>
      <View style={styles.next_teams}>
        <View style={styles.next_team}>
          <Text style={styles.next_flag}>{home?.flag}</Text>
          <Text style={styles.next_name} numberOfLines={1}>{home?.name ?? fixture.home_team_id}</Text>
        </View>
        <Text style={styles.next_vs}>vs</Text>
        <View style={[styles.next_team, { justifyContent: "flex-end" }]}>
          <Text style={styles.next_name} numberOfLines={1}>{away?.name ?? fixture.away_team_id}</Text>
          <Text style={styles.next_flag}>{away?.flag}</Text>
        </View>
      </View>
      <Text style={styles.next_meta}>{fmt_kickoff(fixture.date)}</Text>
      {venue !== "" && <Text style={styles.next_venue}>{venue}</Text>}
    </Pressable>
  );
}

function LiveMatchCard({ fixture, on_open }: { fixture: Fixture; on_open: () => void }) {
  const home = teams_api.get(fixture.home_team_id);
  const away = teams_api.get(fixture.away_team_id);
  return (
    <Pressable style={styles.live_card} onPress={on_open} accessibilityRole="button" accessibilityLabel="Open live match">
      <View style={styles.live_card_badge_row}>
        <View style={styles.live_card_dot} />
        <Text style={styles.live_card_min}>{fixture.minute != null ? `${fixture.minute}'` : "LIVE"}</Text>
      </View>
      <View style={styles.live_card_teams}>
        <Text style={styles.live_card_team} numberOfLines={1}>{home?.flag} {home?.name ?? fixture.home_team_id}</Text>
        <Text style={styles.live_card_score}>{fixture.home_score ?? 0} : {fixture.away_score ?? 0}</Text>
        <Text style={[styles.live_card_team, { textAlign: "right" }]} numberOfLines={1}>{away?.name ?? fixture.away_team_id} {away?.flag}</Text>
      </View>
    </Pressable>
  );
}

function MoverRow({
  player,
  divider,
  on_open,
  rank,
}: {
  player: PlayerWithValuation;
  divider: boolean;
  on_open: (player: PlayerWithValuation) => void;
  rank?: number;
}) {
  const team = teams_api.get(player.team_id);
  const tournament_return = compute_return_pct(player.valuation.current_price, player.valuation.base_value);
  const up = tournament_return >= 0;
  return (
    <Pressable
      style={[styles.mover_row, divider && styles.row_divider]}
      onPress={() => on_open(player)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${player.name}`}
    >
      {rank != null && <Text style={styles.mover_rank}>{rank}</Text>}
      {player.image_path ? (
        <Image source={{ uri: player.image_path }} style={styles.mover_avatar} resizeMode="contain" />
      ) : (
        <View style={[styles.mover_avatar, styles.mover_avatar_chip]}>
          <Text style={styles.mover_avatar_chip_text}>{player.jersey_number}</Text>
        </View>
      )}
      <View style={styles.mover_meta}>
        <Text style={styles.mover_name} numberOfLines={1}>{player.name}</Text>
        <Text style={styles.mover_team} numberOfLines={1}>{team?.flag} {team?.name}</Text>
      </View>
      <Spark data={spark_for_player(player.id)} width={56} height={22} />
      <View style={styles.mover_price}>
        <Text style={styles.mover_price_value}>€{player.valuation.current_price}M</Text>
        <Text style={[styles.mover_price_pct, { color: up ? palette.positive : palette.negative }]}>
          {up ? "+" : ""}
          {tournament_return.toFixed(1)}%
        </Text>
      </View>
    </Pressable>
  );
}

function fmt_news_ts(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function NewsRow({ item, divider }: { item: News; divider: boolean }) {
  const router = useRouter();
  const icon = item.type === "postmatch" ? "🏁" : "📰";
  const meta = [item.fixture_label, fmt_news_ts(item.published_at)].filter(Boolean).join("  ·  ");
  const body = (
    <>
      <Text style={styles.news_icon}>{icon}</Text>
      <View style={styles.news_body}>
        <Text style={styles.news_title}>{item.title}</Text>
        {meta !== "" && <Text style={styles.news_label}>{meta}</Text>}
      </View>
      <Text style={styles.news_kind}>{item.type === "prematch" ? "pre-match" : "post-match"}</Text>
    </>
  );
  // Most news cover a fixture → tapping opens its MatchView. League-level news
  // (no fixture_id) stays non-interactive.
  if (item.fixture_id !== undefined) {
    return (
      <Pressable
        onPress={() => router.push(`/match/${item.fixture_id}`)}
        style={({ pressed }) => [styles.news_row, divider && styles.row_divider, pressed && { opacity: 0.6 }]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={[styles.news_row, divider && styles.row_divider]}>{body}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  scroll_content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32, gap: 14 },
  hero: { paddingTop: 2, paddingBottom: 2 },
  card: {
    backgroundColor: "rgba(255,255,255,0.035)",
    borderColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  section_header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomColor: "rgba(255,255,255,0.04)",
    borderBottomWidth: 1,
  },
  section_title: { color: "#fff", fontSize: 13, fontWeight: "700", letterSpacing: 0.3, flexShrink: 1 },
  cta_btn: { flexShrink: 0, paddingLeft: 10 },
  cta: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "600" },
  meta: { color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: "600" },
  empty: { color: "rgba(255,255,255,0.3)", fontSize: 12, textAlign: "center", paddingVertical: 20 },
  row_divider: { borderTopColor: "rgba(255,255,255,0.05)", borderTopWidth: 1 },

  empty_match: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  empty_match_text: { color: text.secondary, fontSize: 13, fontWeight: "600", flexShrink: 1 },
  view_fixtures: {
    backgroundColor: surface.active,
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  view_fixtures_text: { color: "#fff", fontSize: 12, fontWeight: "700" },

  movers_toggle: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  mtoggle: {
    flex: 1,
    paddingVertical: 7,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  mtoggle_on: { backgroundColor: palette.accentBlueSoft, borderColor: palette.accentBlue },
  mtoggle_label: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "700" },
  mtoggle_label_on: { color: "#fff" },

  league_row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
  league_badge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: surface.active,
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  league_badge_text: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
  league_name: { color: "#fff", fontSize: 13, fontWeight: "700" },
  league_meta: { color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 2 },
  league_stats: { alignItems: "flex-end" },
  league_rank: { fontFamily: mono, color: "#fff", fontSize: 16, fontWeight: "800" },
  league_return: { fontFamily: mono, fontSize: 11, fontWeight: "700", marginTop: 1 },

  live_card: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: with_alpha(palette.positive, 0.05),
    borderWidth: 1,
    borderColor: with_alpha(palette.positive, 0.12),
    gap: 10,
  },
  live_card_badge_row: { flexDirection: "row", alignItems: "center", gap: 6 },
  live_card_dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.brandGreen },
  live_card_min: { fontFamily: mono, fontSize: 11, fontWeight: "800", color: palette.brandGreen, letterSpacing: 0.5 },
  live_card_teams: { flexDirection: "row", alignItems: "center", gap: 12 },
  live_card_team: { flex: 1, color: "#fff", fontSize: 13, fontWeight: "700" },
  live_card_score: { fontFamily: mono, fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },

  next_card: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    gap: 8,
  },
  next_kicker: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" },
  next_teams: { flexDirection: "row", alignItems: "center", gap: 10 },
  next_team: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  next_flag: { fontSize: 24 },
  next_name: { color: "#fff", fontSize: 15, fontWeight: "800", flexShrink: 1 },
  next_vs: { color: "rgba(255,255,255,0.3)", fontSize: 12, fontWeight: "700" },
  next_meta: { fontFamily: mono, color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "700" },
  next_venue: { color: "rgba(255,255,255,0.45)", fontSize: 12 },

  mover_row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
  mover_rank: { fontFamily: mono, width: 16, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "800" },
  mover_avatar: {
    width: 34,
    height: 34,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
  },
  mover_avatar_chip: { alignItems: "center", justifyContent: "center" },
  mover_avatar_chip_text: { color: "#fff", fontSize: 11, fontWeight: "800" },
  mover_meta: { flex: 1, minWidth: 0 },
  mover_name: { color: "#fff", fontSize: 13, fontWeight: "700", flexShrink: 1 },
  mover_team: { color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 2 },
  mover_price: { alignItems: "flex-end", minWidth: 64 },
  mover_price_value: { fontFamily: mono, color: "#fff", fontSize: 12, fontWeight: "700" },
  mover_price_pct: { fontFamily: mono, fontSize: 11, fontWeight: "800", marginTop: 2 },

  news_row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  news_icon: { fontSize: 20 },
  news_body: { flex: 1 },
  news_title: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "500", lineHeight: 18 },
  news_label: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: "600", marginTop: 6 },
  news_kind: { color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: "500" },
});
