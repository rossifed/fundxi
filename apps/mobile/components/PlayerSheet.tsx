// PlayerSheet — full player detail bottom sheet. RN port of
// apps/web/src/ui/pages/player/PlayerSheet.tsx (+ its sub-panels). The web
// modal is a 2-column desktop layout; on mobile every panel stacks in a single
// scrollable column (CLAUDE.md UI rule). Every value is real provider data via
// the api layer — no synthesised content. Trading is gated until mobile auth
// lands (project plan defers it); the Buy/Sell affordances are present and
// explain that on tap.

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";

import { players_api } from "@fundxi/core/api/players_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import { POSITION_LABEL, type Player } from "@fundxi/core/domain/player/player";
import { compute_period_return, compute_return_pct } from "@fundxi/core/domain/market/return";
import { compute_portfolio_share } from "@fundxi/core/domain/portfolio/portfolio_metrics";
import type { PlayerTournamentStat } from "@fundxi/core/infrastructure/repositories/player_stats_repository";
import type { PlayerMatchEntry } from "@fundxi/core/infrastructure/repositories/player_matches_repository";
import type { PlayerNewsEntry } from "@fundxi/core/infrastructure/repositories/player_news_repository";
import type { PricePoint } from "@fundxi/core/infrastructure/repositories/valuations_repository";

import { PlayerChip } from "@/components/PlayerChip";
import { PerformanceChart } from "@/components/PerformanceChart";
import { TickValue } from "@/components/TickValue";
import { useLiveRefetch, usePlayerLiveVersion } from "@/components/live";
import { color_for_sign, fmt_eur_m, fmt_eur_m_signed, fmt_signed_pct } from "@/lib/format";
import { palette, text } from "@/theme/tokens";

export interface PlayerSheetHandle {
  open(player: Player): void;
}

export const PlayerSheet = forwardRef<PlayerSheetHandle, object>(function PlayerSheet(_props, ref) {
  const sheet_ref = useRef<BottomSheet>(null);
  const snap_points = useMemo(() => ["92%"], []);
  const [player, set_player] = useState<Player | null>(null);

  useImperativeHandle(ref, () => ({
    open(p: Player) {
      set_player(p);
      sheet_ref.current?.expand();
    },
  }));

  const render_backdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />
  );

  return (
    <BottomSheet
      ref={sheet_ref}
      index={-1}
      snapPoints={snap_points}
      enablePanDownToClose
      onClose={() => set_player(null)}
      backdropComponent={render_backdrop}
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {player && <PlayerDetail player={player} />}
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

function PlayerDetail({ player }: { player: Player }) {
  const team = teams_api.get(player.team_id);
  const valuation = valuations_api.get_for_player(player.id);
  const current_price = valuation?.current_price ?? 0;
  const performance_rating = valuation?.performance_rating ?? 0;

  const [price_history, set_price_history] = useState<PricePoint[] | null>(null);
  const [stats, set_stats] = useState<PlayerTournamentStat | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    set_price_history(null);
    set_stats(undefined);
    valuations_api.get_price_history(player.id).then(
      p => !cancelled && set_price_history(p),
      () => !cancelled && set_price_history([]),
    );
    players_api.get_tournament_stats(player.id).then(
      s => !cancelled && set_stats(s),
      () => !cancelled && set_stats(null),
    );
    return () => {
      cancelled = true;
    };
  }, [player.id]);

  const live = usePlayerLiveVersion(player.id);
  useLiveRefetch(live, () => {
    valuations_api
      .refresh()
      .then(() => valuations_api.refresh_price_history(player.id))
      .then(set_price_history)
      .catch(() => {});
  });

  const gate_trade = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Trading", "Trading opens once accounts land on mobile (auth in progress).");
  };

  return (
    <View style={styles.detail}>
      <Header player={player} team_color={team?.color ?? "#888"} team_name={team?.name ?? "?"} team_flag={team?.flag} team_flag_url={team?.flag_url} />

      <ValuationRibbon
        player_id={player.id}
        current_price={current_price}
        performance_rating={performance_rating}
        price_history={price_history}
        stats={stats}
      />

      <PriceChart price_history={price_history} />

      <SectionCard title="Personal">
        <View style={styles.kpi_grid}>
          <SmallKpi label="Position" value={player.detailed_position ?? POSITION_LABEL[player.position]} />
          <SmallKpi label="Age" value={String(player.age ?? "—")} />
          <SmallKpi label="Foot" value={player.foot ?? "—"} />
          <SmallKpi label="Height" value={player.height ?? "—"} />
          <SmallKpi label="Weight" value={player.weight ?? "—"} />
        </View>
      </SectionCard>

      {player.tags && player.tags.length > 0 && (
        <SectionCard title="Skills">
          <View style={styles.tags}>
            {player.tags.map(t => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tag_label}>{t}</Text>
              </View>
            ))}
          </View>
        </SectionCard>
      )}

      {stats != null && (
        <SectionCard title="Statistics">
          <View style={styles.kpi_grid}>
            <SmallKpi label="Apps" value={String(stats.appearances ?? 0)} />
            <SmallKpi label="Min" value={String(stats.minutes_played ?? 0)} />
            <SmallKpi label="Goals" value={String(stats.goals ?? 0)} color={(stats.goals ?? 0) > 0 ? palette.positive : undefined} />
            <SmallKpi label="Assists" value={String(stats.assists ?? 0)} color={(stats.assists ?? 0) > 0 ? palette.positive : undefined} />
            <SmallKpi label="Shots" value={`${stats.shots_on_target ?? 0}/${stats.shots_total ?? 0}`} />
            <SmallKpi label="Yellow" value={String(stats.yellow_cards ?? 0)} color={(stats.yellow_cards ?? 0) > 0 ? palette.cardYellow : undefined} />
            <SmallKpi label="Red" value={String(stats.red_cards ?? 0)} color={(stats.red_cards ?? 0) > 0 ? palette.negative : undefined} />
            <SmallKpi label="Key P" value={String(stats.key_passes ?? 0)} />
            <SmallKpi label="Passes" value={String(stats.passes_total ?? 0)} />
            <SmallKpi label="Pass %" value={stats.passes_accuracy != null ? `${stats.passes_accuracy.toFixed(0)}%` : "—"} />
          </View>
        </SectionCard>
      )}

      <MatchLog player_id={player.id} />

      <YourPosition player={player} current_price={current_price} />

      <View style={styles.trade_row}>
        <Pressable style={[styles.trade_btn, { backgroundColor: palette.actionBuy }]} onPress={gate_trade}>
          <Text style={styles.trade_label}>Buy</Text>
        </Pressable>
        <Pressable style={[styles.trade_btn, { backgroundColor: palette.actionSell }]} onPress={gate_trade}>
          <Text style={styles.trade_label}>Sell</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Header({
  player,
  team_color,
  team_name,
  team_flag,
  team_flag_url,
}: {
  player: Player;
  team_color: string;
  team_name: string;
  team_flag?: string;
  team_flag_url?: string;
}) {
  return (
    <View style={styles.header}>
      {player.image_path ? (
        <Image source={{ uri: player.image_path }} style={styles.photo} resizeMode="contain" />
      ) : (
        <PlayerChip jersey_number={player.jersey_number} team_color={team_color} size={64} />
      )}
      <View style={styles.identity}>
        <View style={styles.name_row}>
          <Text style={styles.jersey}>{player.jersey_number}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {player.full_name ?? player.name}
          </Text>
        </View>
        <View style={styles.team_row}>
          {team_flag_url ? (
            <Image source={{ uri: team_flag_url }} style={styles.team_flag_img} resizeMode="contain" />
          ) : (
            <Text style={styles.team_flag}>{team_flag}</Text>
          )}
          <Text style={styles.team_name}>{team_name}</Text>
        </View>
      </View>
    </View>
  );
}

function ValuationRibbon({
  player_id,
  current_price,
  performance_rating,
  price_history,
  stats,
}: {
  player_id: number;
  current_price: number;
  performance_rating: number;
  price_history: PricePoint[] | null;
  stats: PlayerTournamentStat | null | undefined;
}) {
  const holding = portfolio_api.get_holding(player_id);
  const shares = holding?.shares ?? 0;
  const pnl = shares !== 0 ? shares * (current_price - (holding?.average_buy_price ?? 0)) : null;

  const ph = price_history ?? [];
  const since_start = ph.length > 1 ? compute_period_return(ph.map(p => p.price)) : null;
  let last_match: number | null = null;
  if (ph.length > 1) {
    const last_fx = [...ph].reverse().find(p => p.fixture_id !== null)?.fixture_id;
    if (last_fx != null) {
      const ticks = ph.filter(p => p.fixture_id === last_fx);
      if (ticks.length > 1) last_match = compute_period_return(ticks.map(t => t.price));
    }
  }
  const apps = stats?.appearances ?? null;
  const avg_match = since_start !== null && apps && apps > 0 ? since_start / apps : null;
  const pc = (v: number | null) => (v === null ? undefined : color_for_sign(v));

  return (
    <SectionCard title="Valuation">
      <View style={styles.kpi_grid}>
        <SmallKpi
          label="Value"
          value={
            <TickValue value={current_price}>
              <Text style={styles.kpi_value}>€{current_price}M</Text>
            </TickValue>
          }
        />
        <SmallKpi label="Rating" value={String(performance_rating)} color="rgba(255,255,255,0.85)" />
        <SmallKpi label="P&L" value={pnl !== null ? fmt_eur_m_signed(pnl) : "—"} color={pnl !== null ? color_for_sign(pnl) : undefined} />
        <SmallKpi label="Since Start" value={fmt_signed_pct(since_start, 1)} color={pc(since_start)} />
        <SmallKpi label="Last Match" value={fmt_signed_pct(last_match, 1)} color={pc(last_match)} />
        <SmallKpi label="Avg / Match" value={fmt_signed_pct(avg_match, 1)} color={pc(avg_match)} />
      </View>
    </SectionCard>
  );
}

function PriceChart({ price_history }: { price_history: PricePoint[] | null }) {
  if (price_history === null) {
    return <Text style={styles.chart_loading}>loading price history…</Text>;
  }
  if (price_history.length < 2) {
    return <Text style={styles.chart_empty}>No matches played yet</Text>;
  }
  return <PerformanceChart data={price_history.map(p => ({ v: p.price }))} height={180} />;
}

function MatchLog({ player_id }: { player_id: number }) {
  const [tab, set_tab] = useState<"matches" | "news">("matches");
  const [matches, set_matches] = useState<PlayerMatchEntry[] | null>(null);
  const [news, set_news] = useState<PlayerNewsEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    set_matches(null);
    set_news(null);
    players_api.get_matches(player_id).then(
      m => !cancelled && set_matches(m),
      () => !cancelled && set_matches([]),
    );
    players_api.get_news(player_id).then(
      n => !cancelled && set_news(n),
      () => !cancelled && set_news([]),
    );
    return () => {
      cancelled = true;
    };
  }, [player_id]);

  const count =
    tab === "matches"
      ? matches === null
        ? "loading…"
        : `${matches.length} appearances`
      : news === null
        ? "loading…"
        : `${news.length} articles`;

  return (
    <View style={styles.matchlog}>
      <View style={styles.matchlog_head}>
        <View style={styles.matchlog_tabs}>
          {(["matches", "news"] as const).map(t => {
            const on = tab === t;
            return (
              <Pressable key={t} onPress={() => set_tab(t)} style={[styles.ml_tab, on && styles.ml_tab_on]}>
                <Text style={[styles.ml_tab_label, on && styles.ml_tab_label_on]}>{t === "matches" ? "Fixtures" : "News"}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.matchlog_count}>{count}</Text>
      </View>

      {tab === "matches" ? (
        matches === null ? (
          <Text style={styles.ml_loading}>loading…</Text>
        ) : matches.length === 0 ? (
          <Text style={styles.ml_loading}>No matches played yet for this player.</Text>
        ) : (
          matches.map(m => <MatchRow key={m.fixture_id} m={m} />)
        )
      ) : news === null ? (
        <Text style={styles.ml_loading}>loading…</Text>
      ) : news.length === 0 ? (
        <Text style={styles.ml_loading}>No news yet for this player&apos;s team.</Text>
      ) : (
        news.map(n => <NewsRow key={n.id} n={n} />)
      )}
    </View>
  );
}

function MatchRow({ m }: { m: PlayerMatchEntry }) {
  const is_home = m.player_team_id === m.home_team_id;
  const opp = teams_api.get(is_home ? m.away_team_id : m.home_team_id);
  const my_score = is_home ? m.home_score : m.away_score;
  const opp_score = is_home ? m.away_score : m.home_score;
  const finished = m.status === "finished";
  const live = m.status === "live";
  const upcoming = m.status === "upcoming";
  const result =
    !finished || my_score == null || opp_score == null ? null : my_score > opp_score ? "W" : my_score < opp_score ? "L" : "D";
  const result_color = result === "W" ? palette.positive : result === "L" ? palette.negative : text.secondary;
  const dt = m.kickoff_at ? new Date(m.kickoff_at) : null;
  const date_label = dt ? dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" }) : "—";
  const score_label = my_score != null && opp_score != null ? `${my_score}-${opp_score}` : "—";
  const pct = m.in_match_pct;

  return (
    <View style={[styles.ml_row, live && styles.ml_row_live]}>
      <View style={styles.ml_status}>
        {live ? (
          <View style={styles.ml_live}>
            <Text style={styles.ml_live_label}>LIVE</Text>
          </View>
        ) : upcoming ? (
          <Text style={styles.ml_soon}>SOON</Text>
        ) : (
          <Text style={[styles.ml_result, { color: result_color }]}>{result ?? "—"}</Text>
        )}
      </View>
      {opp?.flag_url ? (
        <Image source={{ uri: opp.flag_url }} style={styles.ml_flag} resizeMode="contain" />
      ) : (
        <Text style={styles.ml_flag_emoji}>{opp?.flag ?? ""}</Text>
      )}
      <View style={styles.ml_meta}>
        <Text style={styles.ml_opp} numberOfLines={1}>
          {opp?.name ?? (is_home ? m.away_team_id : m.home_team_id)}
        </Text>
        <Text style={styles.ml_date}>{date_label}</Text>
      </View>
      <Text style={styles.ml_score}>{finished || live ? score_label : "—"}</Text>
      <Text
        style={[
          styles.ml_pct,
          { color: !finished ? text.muted : pct == null ? text.muted : pct >= 0 ? palette.positive : palette.negative },
        ]}
      >
        {finished && pct != null ? fmt_signed_pct(pct, 2) : "—"}
      </Text>
    </View>
  );
}

function NewsRow({ n }: { n: PlayerNewsEntry }) {
  const dt = n.published_at ? new Date(n.published_at) : null;
  const date_label = dt ? dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" }) : "—";
  const type_label = n.type === "prematch" ? "PRE" : n.type === "postmatch" ? "POST" : n.type.toUpperCase();
  return (
    <View style={styles.news_row}>
      <View style={styles.news_type}>
        <Text style={styles.news_type_label}>{type_label}</Text>
      </View>
      <Text style={styles.news_title} numberOfLines={2}>
        {n.title}
      </Text>
      <Text style={styles.news_date}>{date_label}</Text>
    </View>
  );
}

function YourPosition({ player, current_price }: { player: Player; current_price: number }) {
  const holding = portfolio_api.get_holding(player.id);
  const totals = portfolio_api.get_totals();
  const has_position = !!holding && holding.shares !== 0;

  if (!has_position) {
    return (
      <View style={styles.position_card}>
        <View style={styles.position_head}>
          <Text style={styles.position_title}>Your position</Text>
          <View style={styles.position_badge}>
            <Text style={styles.position_badge_label}>—</Text>
          </View>
        </View>
        <Text style={styles.position_empty}>
          You don&apos;t hold this player. Use the trade panel below to open a position.
        </Text>
      </View>
    );
  }

  const shares = holding!.shares;
  const market_value = shares * current_price;
  const cost_basis = shares * holding!.average_buy_price;
  const pnl = market_value - cost_basis;
  const return_pct = compute_return_pct(market_value, cost_basis);
  const portfolio_pct = compute_portfolio_share(market_value, totals.total_value);
  const is_long = shares > 0;

  return (
    <View style={styles.position_card}>
      <View style={styles.position_head}>
        <Text style={styles.position_title}>Your position</Text>
        <View
          style={[
            styles.position_badge,
            { backgroundColor: is_long ? "rgba(55,255,99,0.1)" : "rgba(255,40,93,0.1)" },
          ]}
        >
          <Text style={[styles.position_badge_label, { color: is_long ? palette.positive : palette.negative }]}>
            {is_long ? "LONG" : "SHORT"}
          </Text>
        </View>
      </View>
      <View style={styles.kpi_grid}>
        <SmallKpi label="Shares" value={String(Math.abs(shares))} />
        <SmallKpi label="Avg buy" value={`€${holding!.average_buy_price}M`} />
        <SmallKpi label="Market value" value={fmt_eur_m(market_value)} />
        <SmallKpi label="P&L" value={fmt_eur_m_signed(pnl)} color={color_for_sign(pnl)} />
        <SmallKpi label="Return" value={fmt_signed_pct(return_pct, 1)} color={color_for_sign(return_pct)} />
        <SmallKpi label="% portfolio" value={`${portfolio_pct.toFixed(1)}%`} />
      </View>
    </View>
  );
}

// ── shared sheet primitives (mirror player_sheet_ui.tsx) ──────────────
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.section_title}>{title}</Text>
      {children}
    </View>
  );
}

function SmallKpi({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpi_label}>{label}</Text>
      {typeof value === "string" ? (
        <Text style={[styles.kpi_value, color ? { color } : null]}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { backgroundColor: palette.surfaceDeep },
  handle: { backgroundColor: "rgba(255,255,255,0.2)" },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  detail: { gap: 16 },

  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  photo: { width: 64, height: 64, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  identity: { flex: 1, minWidth: 0 },
  name_row: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  jersey: { fontFamily: "SpaceMono", fontSize: 20, fontWeight: "800", color: "rgba(255,255,255,0.55)", letterSpacing: -0.5 },
  name: { fontSize: 20, fontWeight: "800", color: "#fff", letterSpacing: -0.5, flexShrink: 1 },
  team_row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  team_flag: { fontSize: 18 },
  team_flag_img: { width: 20, height: 20 },
  team_name: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.65)" },

  section: { gap: 6 },
  section_title: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.55)", letterSpacing: 0.5, textTransform: "uppercase" },
  kpi_grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  kpi: {
    minWidth: 88,
    flexGrow: 1,
    flexBasis: "30%",
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  kpi_label: { fontSize: 9, color: text.tertiary, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: "600" },
  kpi_value: { fontFamily: "SpaceMono", fontSize: 13, fontWeight: "800", color: "#fff", marginTop: 1 },

  chart_loading: { color: text.tertiary, fontSize: 12, paddingVertical: 24, textAlign: "center" },
  chart_empty: { color: text.tertiary, fontSize: 13, fontWeight: "600", paddingVertical: 36, textAlign: "center" },

  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 5, paddingHorizontal: 10, paddingVertical: 5 },
  tag_label: { fontSize: 12, fontWeight: "800", color: "#fff" },

  matchlog: { gap: 8 },
  matchlog_head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  matchlog_tabs: { flexDirection: "row", gap: 4 },
  ml_tab: { borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 5, paddingHorizontal: 10, paddingVertical: 4 },
  ml_tab_on: { backgroundColor: "rgba(255,255,255,0.06)" },
  ml_tab_label: { fontSize: 11, fontWeight: "700", color: text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" },
  ml_tab_label_on: { color: "#fff" },
  matchlog_count: { fontSize: 11, color: text.muted },
  ml_loading: { paddingVertical: 12, paddingHorizontal: 8, fontSize: 12, color: text.tertiary },

  ml_row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  ml_row_live: { backgroundColor: "rgba(244,18,88,0.08)", borderColor: "rgba(244,18,88,0.25)" },
  ml_status: { width: 34, alignItems: "flex-start" },
  ml_live: { backgroundColor: palette.actionSell, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },
  ml_live_label: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 0.6 },
  ml_soon: { fontSize: 10, fontWeight: "700", color: text.tertiary, letterSpacing: 0.5 },
  ml_result: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  ml_flag: { width: 22, height: 22 },
  ml_flag_emoji: { fontSize: 16, width: 22 },
  ml_meta: { flex: 1, minWidth: 0 },
  ml_opp: { fontSize: 12, fontWeight: "700", color: "#fff" },
  ml_date: { fontSize: 10, color: text.tertiary, marginTop: 1 },
  ml_score: { fontFamily: "SpaceMono", fontSize: 12, fontWeight: "800", color: "#fff" },
  ml_pct: { fontFamily: "SpaceMono", fontSize: 11, fontWeight: "800", minWidth: 56, textAlign: "right" },

  news_row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  news_type: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, width: 44, alignItems: "center" },
  news_type_label: { fontSize: 9, fontWeight: "800", color: "rgba(255,255,255,0.55)", letterSpacing: 0.6 },
  news_title: { flex: 1, fontSize: 12, fontWeight: "600", color: "#fff", lineHeight: 16 },
  news_date: { fontSize: 10, color: text.tertiary },

  position_card: { backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 10, overflow: "hidden" },
  position_head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)", backgroundColor: "rgba(255,255,255,0.025)" },
  position_title: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.55)", letterSpacing: 0.5, textTransform: "uppercase" },
  position_badge: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  position_badge_label: { fontSize: 10, fontWeight: "800", color: text.tertiary, letterSpacing: 0.5 },
  position_empty: { padding: 14, fontSize: 12, color: text.tertiary, lineHeight: 18 },

  trade_row: { flexDirection: "row", gap: 8, marginTop: 4 },
  trade_btn: { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: "center" },
  trade_label: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
