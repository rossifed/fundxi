import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { matches_api } from "@fundxi/core/api/matches_api";
import { players_api } from "@fundxi/core/api/players_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { news_api } from "@fundxi/core/api/news_api";
import { compute_return_pct } from "@fundxi/core/domain/market/return";
import { spark_for_player } from "@fundxi/core/infrastructure/repositories/valuations_repository";
import { themes } from "@fundxi/core/design/palette";
import type { PlayerWithValuation } from "@fundxi/core/domain/market/player_valuation";
import type { Fixture } from "@fundxi/core/domain/match/fixture";
import type { News } from "@fundxi/core/domain/news/news";

import { Spark } from "@/components/Spark";
import { useMatchesLiveVersion, useStreamStatus } from "@/components/live";
import { PlayerSheet, type PlayerSheetHandle } from "@/components/PlayerSheet";

const palette = themes.dark;

export default function HomeScreen() {
  const router = useRouter();
  const sheet_ref = useRef<PlayerSheetHandle>(null);
  const open_player = (player: PlayerWithValuation) => sheet_ref.current?.open(player);

  // Subscribe to the global "matches" SSE topic. The hook returns a counter
  // that ticks on every `update` frame; we re-read the synchronous repo
  // caches whenever it changes (and refresh fixtures from the BFF first).
  const matches_version = useMatchesLiveVersion();
  const stream_status = useStreamStatus();
  const [refresh_tag, set_refresh_tag] = useState(0);

  useEffect(() => {
    if (matches_version === 0) return; // skip the initial render
    void matches_api.refresh_fixtures().then(() => set_refresh_tag(t => t + 1));
  }, [matches_version]);

  const upcoming = useMemo(
    () => matches_api.list_fixtures().filter(f => f.status === "upcoming").slice(0, 3),
    [refresh_tag],
  );
  const top_up = useMemo(() => players_api.top_movers(5, "up"), [refresh_tag]);
  const top_down = useMemo(() => players_api.top_movers(5, "down"), [refresh_tag]);
  const news = useMemo(() => news_api.list().slice(0, 6), [refresh_tag]);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scroll_content}
        showsVerticalScrollIndicator={false}
      >
        <Hero />

      <SectionCard>
        <SectionHeader
          title="Match Center"
          cta="All fixtures →"
          on_cta={() => router.push("/fixtures")}
          live={stream_status}
        />
        <Text style={styles.section_subtitle}>Up next</Text>
        {upcoming.length === 0 ? (
          <Text style={styles.empty}>No upcoming fixtures scheduled.</Text>
        ) : (
          upcoming.map((fx, i) => <FixtureRow key={fx.id} fixture={fx} divider={i > 0} />)
        )}
      </SectionCard>

      <SectionCard>
        <SectionHeader
          title="Top movers · since tournament start"
          cta="Open screener →"
          on_cta={() => router.push("/screener")}
        />
        <MoversColumn label="Top gainers" players={top_up} on_open={open_player} />
        <View style={styles.movers_divider} />
        <MoversColumn label="Top losers" players={top_down} on_open={open_player} />
      </SectionCard>

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

function Hero() {
  return (
    <View style={styles.hero}>
      <Text style={styles.hero_title}>
        Fund<Text style={styles.hero_title_accent}>XI</Text>
      </Text>
      <Text style={styles.hero_tagline}>
        Every touch has a <Text style={styles.hero_tagline_accent}>price</Text>
      </Text>
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
  live,
}: {
  title: string;
  cta?: string;
  on_cta?: () => void;
  meta?: string;
  live?: "online" | "offline" | "unknown";
}) {
  return (
    <View style={styles.section_header}>
      <View style={styles.section_title_row}>
        <Text style={styles.section_title}>{title}</Text>
        {live && <LiveDot status={live} />}
      </View>
      {cta && on_cta && (
        <Pressable onPress={on_cta}>
          <Text style={styles.cta}>{cta}</Text>
        </Pressable>
      )}
      {meta && <Text style={styles.meta}>{meta}</Text>}
    </View>
  );
}

function LiveDot({ status }: { status: "online" | "offline" | "unknown" }) {
  const color =
    status === "online" ? palette.positive : status === "offline" ? palette.negative : "rgba(255,255,255,0.3)";
  const label = status === "online" ? "live" : status === "offline" ? "offline" : "…";
  return (
    <View style={styles.live_dot_row}>
      <View style={[styles.live_dot, { backgroundColor: color }]} />
      <Text style={[styles.live_dot_label, { color }]}>{label}</Text>
    </View>
  );
}

function FixtureRow({ fixture, divider }: { fixture: Fixture; divider: boolean }) {
  const home = teams_api.get(fixture.home_team_id);
  const away = teams_api.get(fixture.away_team_id);
  if (!home || !away) return null;
  return (
    <View style={[styles.fixture_row, divider && styles.row_divider]}>
      <Text style={styles.fixture_date}>{fixture.date ?? "TBD"}</Text>
      <View style={styles.fixture_teams}>
        <View style={styles.fixture_team_right}>
          <Text style={styles.team_name}>{home.name}</Text>
          <Text style={styles.team_flag}>{home.flag}</Text>
        </View>
        <Text style={styles.fixture_vs}>vs</Text>
        <View style={styles.fixture_team_left}>
          <Text style={styles.team_flag}>{away.flag}</Text>
          <Text style={styles.team_name}>{away.name}</Text>
        </View>
      </View>
    </View>
  );
}

function MoversColumn({
  label,
  players,
  on_open,
}: {
  label: string;
  players: PlayerWithValuation[];
  on_open: (player: PlayerWithValuation) => void;
}) {
  return (
    <View>
      <Text style={styles.section_subtitle}>{label}</Text>
      {players.map((p, i) => (
        <MoverRow key={p.id} player={p} divider={i > 0} on_open={on_open} />
      ))}
    </View>
  );
}

function MoverRow({
  player,
  divider,
  on_open,
}: {
  player: PlayerWithValuation;
  divider: boolean;
  on_open: (player: PlayerWithValuation) => void;
}) {
  const team = teams_api.get(player.team_id);
  const tournament_return = compute_return_pct(
    player.valuation.current_price,
    player.valuation.base_value,
  );
  const up = tournament_return >= 0;
  return (
    <Pressable
      style={[styles.mover_row, divider && styles.row_divider]}
      onPress={() => on_open(player)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${player.name}`}
    >
      {player.image_path ? (
        <Image source={{ uri: player.image_path }} style={styles.mover_avatar} resizeMode="contain" />
      ) : (
        <View style={[styles.mover_avatar, styles.mover_avatar_chip]}>
          <Text style={styles.mover_avatar_chip_text}>{player.jersey_number}</Text>
        </View>
      )}
      <View style={styles.mover_meta}>
        <View style={styles.mover_name_row}>
          <Text style={styles.mover_jersey}>{player.jersey_number}</Text>
          <Text style={styles.mover_name} numberOfLines={1}>
            {player.name}
          </Text>
        </View>
        <Text style={styles.mover_team} numberOfLines={1}>
          {team?.flag} {team?.name}
        </Text>
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

function NewsRow({ item, divider }: { item: News; divider: boolean }) {
  const icon = item.type === "postmatch" ? "🏁" : "📰";
  return (
    <View style={[styles.news_row, divider && styles.row_divider]}>
      <Text style={styles.news_icon}>{icon}</Text>
      <View style={styles.news_body}>
        <Text style={styles.news_title}>{item.title}</Text>
        {item.fixture_label && <Text style={styles.news_label}>{item.fixture_label}</Text>}
      </View>
      <Text style={styles.news_kind}>{item.type === "prematch" ? "pre-match" : "post-match"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  scroll: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  scroll_content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  hero: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  hero_title: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: -1.5,
    lineHeight: 48,
  },
  hero_title_accent: {
    color: palette.accent,
  },
  hero_tagline: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  hero_tagline_accent: {
    color: palette.accent,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: "rgba(255,255,255,0.05)",
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
  section_title_row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  section_title: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  live_dot_row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  live_dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  live_dot_label: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cta: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "600",
  },
  meta: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    fontWeight: "600",
  },
  section_subtitle: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  empty: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 20,
  },
  row_divider: {
    borderTopColor: "rgba(255,255,255,0.03)",
    borderTopWidth: 1,
  },
  fixture_row: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 4,
  },
  fixture_date: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "600",
  },
  fixture_teams: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fixture_team_right: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  fixture_team_left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  team_name: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  team_flag: {
    fontSize: 18,
  },
  fixture_vs: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 11,
    fontWeight: "600",
  },
  movers_divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    marginVertical: 4,
  },
  mover_row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  mover_avatar: {
    width: 34,
    height: 34,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
  },
  mover_avatar_chip: {
    alignItems: "center",
    justifyContent: "center",
  },
  mover_avatar_chip_text: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  mover_meta: {
    flex: 1,
    minWidth: 0,
  },
  mover_name_row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  mover_jersey: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontWeight: "700",
  },
  mover_name: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },
  mover_team: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 10,
    marginTop: 2,
  },
  mover_price: {
    alignItems: "flex-end",
    minWidth: 64,
  },
  mover_price_value: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  mover_price_pct: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  news_row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  news_icon: {
    fontSize: 20,
  },
  news_body: {
    flex: 1,
  },
  news_title: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  news_label: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 6,
  },
  news_kind: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 10,
    fontWeight: "500",
  },
});
