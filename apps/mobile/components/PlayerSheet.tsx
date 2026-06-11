// PlayerSheet — full player detail bottom sheet. RN port of
// apps/web/src/ui/pages/player/PlayerSheet.tsx (+ its sub-panels). The web
// modal is a 2-column desktop layout; on mobile every panel stacks in a single
// scrollable column (CLAUDE.md UI rule). Every value is real provider data via
// the api layer — no synthesised content. Trading is gated until mobile auth
// lands (project plan defers it); the Buy/Sell affordances are present and
// explain that on tap.

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from "@gorhom/bottom-sheet";

import { players_api } from "@fundxi/core/api/players_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import { POSITION_LABEL, type Player } from "@fundxi/core/domain/player/player";
import type { PlayerValuation } from "@fundxi/core/domain/market/player_valuation";
import { compute_portfolio_share } from "@fundxi/core/domain/portfolio/portfolio_metrics";
import type { PlayerTournamentStat } from "@fundxi/core/infrastructure/repositories/player_stats_repository";
import type { PlayerMatchEntry } from "@fundxi/core/infrastructure/repositories/player_matches_repository";
import type { PlayerNewsEntry } from "@fundxi/core/infrastructure/repositories/player_news_repository";
import type { PricePoint } from "@fundxi/core/infrastructure/repositories/valuations_repository";

import { useAuth } from "@/components/AuthContext";
import { PlayerChip } from "@/components/PlayerChip";
import { PerformanceChart } from "@/components/PerformanceChart";
import { TickValue } from "@/components/TickValue";
import { TradeSheet } from "@/components/TradeSheet";
import { useLiveRefetch, usePlayerLiveVersion } from "@/components/live";
import { color_for_sign, fmt_eur_m, fmt_eur_m_signed, fmt_signed_pct } from "@/lib/format";
import { border, mono, palette, surface, text, with_alpha } from "@/theme/tokens";

export interface PlayerSheetHandle {
  open(player: Player): void;
}

export const PlayerSheet = forwardRef<PlayerSheetHandle, object>(function PlayerSheet(_props, ref) {
  const router = useRouter();
  const sheet_ref = useRef<BottomSheet>(null);
  const snap_points = useMemo(() => ["88%"], []);
  const [player, set_player] = useState<Player | null>(null);
  const { status: auth_status, prompt: auth_prompt } = useAuth();
  const [trade_kind, set_trade_kind] = useState<"buy" | "sell" | null>(null);
  // Bumped after a successful order so the position card / ribbon re-read the
  // updated holding (portfolio caches are refreshed inside trades_api.execute).
  const [trade_version, set_trade_version] = useState(0);

  useImperativeHandle(ref, () => ({
    open(p: Player) {
      set_player(p);
      sheet_ref.current?.expand();
    },
  }));

  // Tap the team → close the sheet and push the team hub.
  const open_team = (team_id: string) => {
    sheet_ref.current?.close();
    router.push(`/team/${team_id}`);
  };

  const current_price = (player ? valuations_api.get_for_player(player.id)?.current_price : 0) ?? 0;

  const gate_trade = (k: "buy" | "sell") => {
    if (auth_status === "authenticated") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      set_trade_kind(k);
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      auth_prompt("register");
    }
  };

  const render_backdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />
  );

  // Sticky trade bar pinned to the bottom of the sheet — Buy/Sell stay visible
  // without scrolling, whatever the content length.
  const render_footer = (props: BottomSheetFooterProps) => (
    <BottomSheetFooter {...props} bottomInset={0}>
      <View style={styles.footer}>
        <Pressable style={[styles.trade_btn, { backgroundColor: palette.actionBuy }]} onPress={() => gate_trade("buy")}>
          <Text style={styles.trade_label}>Buy</Text>
        </Pressable>
        <Pressable style={[styles.trade_btn, { backgroundColor: palette.actionSell }]} onPress={() => gate_trade("sell")}>
          <Text style={styles.trade_label}>Sell</Text>
        </Pressable>
      </View>
    </BottomSheetFooter>
  );

  return (
    <>
      <BottomSheet
        ref={sheet_ref}
        index={-1}
        snapPoints={snap_points}
        enablePanDownToClose
        onClose={() => set_player(null)}
        backdropComponent={render_backdrop}
        footerComponent={player ? render_footer : undefined}
        backgroundStyle={styles.bg}
        handleIndicatorStyle={styles.handle}
      >
        <SheetGlow />
        <BottomSheetScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {player && <PlayerDetail player={player} on_open_team={open_team} trade_version={trade_version} />}
        </BottomSheetScrollView>
      </BottomSheet>
      {player && (
        <TradeSheet
          visible={trade_kind !== null}
          player={player}
          current_price={current_price}
          initial_kind={trade_kind ?? "buy"}
          on_close={() => set_trade_kind(null)}
          on_done={() => set_trade_version(v => v + 1)}
        />
      )}
    </>
  );
});

function PlayerDetail({
  player,
  on_open_team,
  trade_version,
}: {
  player: Player;
  on_open_team: (team_id: string) => void;
  trade_version: number;
}) {
  const team = teams_api.get(player.team_id);
  const valuation = valuations_api.get_for_player(player.id);

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

  return (
    <View style={styles.detail}>
      <Header player={player} team_color={team?.color ?? "#888"} team_name={team?.name ?? "?"} team_flag={team?.flag} team_flag_url={team?.flag_url} on_open_team={() => on_open_team(player.team_id)} />

      <ValuationRibbon player_id={player.id} valuation={valuation} stats={stats} refresh={trade_version} />

      {stats != null && (
        <SectionCard title="Statistics">
          <View style={styles.kpi_grid}>
            <SmallKpi compact label="Apps" value={String(stats.appearances ?? 0)} />
            <SmallKpi compact label="Min" value={String(stats.minutes_played ?? 0)} />
            <SmallKpi compact label="Goals" value={String(stats.goals ?? 0)} color={(stats.goals ?? 0) > 0 ? palette.positive : undefined} />
            <SmallKpi compact label="Assists" value={String(stats.assists ?? 0)} color={(stats.assists ?? 0) > 0 ? palette.positive : undefined} />
            <SmallKpi compact label="Shots" value={`${stats.shots_on_target ?? 0}/${stats.shots_total ?? 0}`} />
            <SmallKpi compact label="Yellow" value={String(stats.yellow_cards ?? 0)} color={(stats.yellow_cards ?? 0) > 0 ? palette.cardYellow : undefined} />
            <SmallKpi compact label="Red" value={String(stats.red_cards ?? 0)} color={(stats.red_cards ?? 0) > 0 ? palette.negative : undefined} />
            <SmallKpi compact label="Key P" value={String(stats.key_passes ?? 0)} />
            <SmallKpi compact label="Passes" value={String(stats.passes_total ?? 0)} />
            <SmallKpi compact label="Pass %" value={stats.passes_accuracy != null ? `${stats.passes_accuracy.toFixed(0)}%` : "—"} />
          </View>
        </SectionCard>
      )}

      <PriceChart price_history={price_history} />

      <YourPosition player={player} refresh={trade_version} />

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

      <MatchLog player_id={player.id} />
    </View>
  );
}

function Header({
  player,
  team_color,
  team_name,
  team_flag,
  team_flag_url,
  on_open_team,
}: {
  player: Player;
  team_color: string;
  team_name: string;
  team_flag?: string;
  team_flag_url?: string;
  on_open_team: () => void;
}) {
  const position = player.detailed_position ?? POSITION_LABEL[player.position];
  return (
    <View style={styles.header}>
      <View style={styles.header_top}>
        {player.image_path ? (
          <Image source={{ uri: player.image_path }} style={styles.photo} resizeMode="contain" />
        ) : (
          <PlayerChip jersey_number={player.jersey_number} team_color={team_color} size={72} />
        )}
        <View style={styles.identity}>
          <View style={styles.name_row}>
            <Text style={styles.jersey}>{player.jersey_number}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {player.full_name ?? player.name}
            </Text>
          </View>
          <View style={styles.team_row}>
            <Pressable style={styles.team_tap} onPress={on_open_team} hitSlop={6}>
              {team_flag_url ? (
                <Image source={{ uri: team_flag_url }} style={styles.team_flag_img} resizeMode="contain" />
              ) : (
                <Text style={styles.team_flag}>{team_flag}</Text>
              )}
              <Text style={styles.team_name} numberOfLines={1}>
                {team_name}
              </Text>
            </Pressable>
            <Text style={styles.team_sep}>·</Text>
            <Text style={styles.team_pos} numberOfLines={1}>
              {position}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.bio_grid}>
        <BioStat label="Age" value={player.age != null ? String(player.age) : "—"} />
        <BioStat label="Height" value={player.height ?? "—"} />
        <BioStat label="Weight" value={player.weight ?? "—"} />
        <BioStat label="Foot" value={player.foot ? `${player.foot[0].toUpperCase()}${player.foot.slice(1)}` : "—"} />
      </View>
    </View>
  );
}

function ValuationRibbon({
  player_id,
  valuation,
  stats,
  refresh,
}: {
  player_id: number;
  valuation: PlayerValuation | undefined;
  stats: PlayerTournamentStat | null | undefined;
  refresh: number;
}) {
  const current_price = valuation?.current_price ?? 0;
  // P&L from the single core source (same as the Your-position card + web), so
  // the header never disagrees with the card or the holdings list.
  const metrics = useMemo(() => portfolio_api.get_holding_metrics(player_id), [player_id, refresh]);
  const pnl = metrics && metrics.shares !== 0 ? metrics.pnl : null;

  // Returns come straight from the server valuation — NEVER recomputed in JS —
  // so this sheet and the screener row always reconcile (COHERENCE-INVARIANT).
  // Avg/Match mirrors the screener's own formula (since-start ÷ appearances).
  const since_start = valuation?.change_since_inception ?? null;
  const last_match = valuation?.change_last_match ?? null;
  const apps = stats?.appearances ?? null;
  const avg_match = since_start !== null && apps && apps > 0 ? since_start / apps : null;
  // Rating here = SEASON average (player_tournament_stat), a distinct metric
  // from the latest-match rating (valuation.performance_rating).
  const rating = stats?.rating_avg ?? null;
  const pc = (v: number | null) => (v === null ? undefined : color_for_sign(v));

  return (
    <SectionCard title="Valuation">
      <View style={styles.kpi_grid}>
        <SmallKpi
          label="Value"
          value={
            <TickValue value={current_price}>
              <Text style={styles.kpi_value}>€{current_price.toFixed(1)}M</Text>
            </TickValue>
          }
        />
        <SmallKpi label="Rating" value={rating == null ? "—" : rating.toFixed(1)} color="rgba(255,255,255,0.85)" />
        <SmallKpi label="P&L" value={pnl !== null ? fmt_eur_m_signed(pnl) : "—"} color={pnl !== null ? color_for_sign(pnl) : undefined} />
        <SmallKpi label="Since Start" value={fmt_signed_pct(since_start, 1)} color={pc(since_start)} />
        <SmallKpi label="Last Match" value={fmt_signed_pct(last_match, 1)} color={pc(last_match)} />
        <SmallKpi label="Avg / Match" value={fmt_signed_pct(avg_match, 1)} color={pc(avg_match)} />
      </View>
    </SectionCard>
  );
}

function PriceChart({ price_history }: { price_history: PricePoint[] | null }) {
  return (
    <SectionCard title="Price · since tournament start">
      {price_history === null ? (
        <Text style={styles.chart_loading}>loading price history…</Text>
      ) : price_history.length < 2 ? (
        <Text style={styles.chart_empty}>No matches played yet</Text>
      ) : (
        <PerformanceChart
          data={price_history.map(p => ({
            v: p.price,
            ts: Date.parse(p.ts),
            label: new Date(p.ts).toLocaleDateString(undefined, { day: "2-digit", month: "short" }),
          }))}
          height={200}
          show_axes
          show_last_value
          format_value={p => fmt_eur_m(p.v)}
        />
      )}
    </SectionCard>
  );
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

function YourPosition({ player, refresh }: { player: Player; refresh: number }) {
  // Single source: market_value / pnl / return come from the core metrics —
  // the SAME function the web card uses — so the two clients are aligned by
  // construction and reconcile with the holdings list + AUM.
  const metrics = useMemo(() => portfolio_api.get_holding_metrics(player.id), [player.id, refresh]);
  const totals = portfolio_api.get_totals();
  const has_position = !!metrics && metrics.shares !== 0;

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

  const { shares, average_buy_price, market_value, pnl, return_pct } = metrics!;
  const portfolio_pct = compute_portfolio_share(market_value, totals.total_value);
  const is_long = shares > 0;

  return (
    <View style={styles.position_card}>
      <View style={styles.position_head}>
        <Text style={styles.position_title}>Your position</Text>
        <View
          style={[
            styles.position_badge,
            { backgroundColor: is_long ? with_alpha(palette.positive, 0.1) : with_alpha(palette.negative, 0.1) },
          ]}
        >
          <Text style={[styles.position_badge_label, { color: is_long ? palette.positive : palette.negative }]}>
            {is_long ? "LONG" : "SHORT"}
          </Text>
        </View>
      </View>
      <View style={styles.kpi_grid}>
        <SmallKpi label="Shares" value={String(Math.abs(shares))} />
        <SmallKpi label="Avg buy" value={`€${average_buy_price}M`} />
        <SmallKpi label="Market value" value={fmt_eur_m(market_value)} />
        <SmallKpi label="P&L" value={fmt_eur_m_signed(pnl)} color={color_for_sign(pnl)} />
        <SmallKpi label="Return" value={fmt_signed_pct(return_pct, 1)} color={color_for_sign(return_pct)} />
        <SmallKpi label="% portfolio" value={`${portfolio_pct.toFixed(1)}%`} />
      </View>
    </View>
  );
}

// Ambient blue glow on the sheet surface — a top-left radial echoing the app
// background (same grad1/grad2 stops), so the card reads as part of the world
// instead of a flat dark slab. Sits behind the scrolling content, clipped to
// the sheet's rounded top. Decorative only → pointerEvents none.
function SheetGlow() {
  return (
    <View style={styles.glow} pointerEvents="none">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="sheet_glow" cx="0%" cy="0%" rx="95%" ry="55%">
            <Stop offset="0" stopColor={palette.grad1} stopOpacity="0.5" />
            <Stop offset="0.4" stopColor={palette.grad2} stopOpacity="0.3" />
            <Stop offset="1" stopColor={palette.grad2} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sheet_glow)" />
      </Svg>
    </View>
  );
}

// One bio cell (Age / Height / Weight / Foot) — equal-width column so the
// header strip reads as a clean grid, not ragged content-sized chips.
function BioStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.bio_cell}>
      <Text style={styles.bio_value} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.bio_label}>{label}</Text>
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

function SmallKpi({
  label,
  value,
  color,
  compact,
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.kpi, compact && styles.kpi_compact]}>
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
  glow: { ...StyleSheet.absoluteFillObject, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: "hidden" },
  handle: { backgroundColor: "rgba(255,255,255,0.2)" },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 96 },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 26,
    backgroundColor: palette.surfaceDeep,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  detail: { gap: 16 },

  header: { paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  header_top: { flexDirection: "row", alignItems: "center", gap: 14 },
  photo: { width: 72, height: 72, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  identity: { flex: 1, minWidth: 0 },
  name_row: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  jersey: { fontFamily: mono, fontSize: 20, fontWeight: "800", color: "rgba(255,255,255,0.55)", letterSpacing: -0.5 },
  name: { fontSize: 20, fontWeight: "800", color: "#fff", letterSpacing: -0.5, flexShrink: 1 },
  team_row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  team_tap: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  team_flag: { fontSize: 18 },
  team_flag_img: { width: 20, height: 20 },
  team_name: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.65)", flexShrink: 1 },
  team_sep: { fontSize: 13, color: text.muted },
  team_pos: { fontSize: 13, fontWeight: "600", color: text.secondary, flexShrink: 1 },
  bio_grid: { flexDirection: "row", gap: 6, marginTop: 12 },
  bio_cell: {
    flex: 1,
    backgroundColor: surface.cardSoft,
    borderWidth: 1,
    borderColor: border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    alignItems: "center",
  },
  bio_value: { fontFamily: mono, fontSize: 13, fontWeight: "800", color: text.primary, letterSpacing: -0.3 },
  bio_label: { fontSize: 9, color: text.tertiary, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "600", marginTop: 2 },

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
  // Tighter column so 5 fit per row (10 stats → 2 rows instead of 4).
  kpi_compact: { minWidth: 52, flexBasis: "18%", paddingHorizontal: 7 },
  kpi_label: { fontSize: 9, color: text.tertiary, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: "600" },
  kpi_value: { fontFamily: mono, fontSize: 13, fontWeight: "800", color: "#fff", marginTop: 1 },

  chart_loading: { color: text.tertiary, fontSize: 12, paddingVertical: 24, textAlign: "center" },
  chart_empty: { color: text.tertiary, fontSize: 13, fontWeight: "600", paddingVertical: 36, textAlign: "center" },
  bio_strip: { fontSize: 12.5, color: text.secondary, lineHeight: 18, marginTop: -6 },
  chart_head: { flexDirection: "row", alignItems: "baseline", gap: 10, marginBottom: 6 },
  chart_value: { fontFamily: mono, fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  chart_delta: { fontFamily: mono, fontSize: 13, fontWeight: "700" },

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
  ml_row_live: { backgroundColor: with_alpha(palette.negative, 0.08), borderColor: with_alpha(palette.negative, 0.25) },
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
  ml_score: { fontFamily: mono, fontSize: 12, fontWeight: "800", color: "#fff" },
  ml_pct: { fontFamily: mono, fontSize: 11, fontWeight: "800", minWidth: 56, textAlign: "right" },

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
