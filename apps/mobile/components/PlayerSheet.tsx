// PlayerSheet — full player detail bottom sheet. RN port of
// apps/web/src/ui/pages/player/PlayerSheet.tsx (+ its sub-panels). The web
// modal is a 2-column desktop layout; on mobile every panel stacks in a single
// scrollable column (CLAUDE.md UI rule). Every value is real provider data via
// the api layer — no synthesised content. Trading is gated until mobile auth
// lands (project plan defers it); the Buy/Sell affordances are present and
// explain that on tap.

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
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
import { trades_api } from "@fundxi/core/api/trades_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import { useWatchlist, watchlist } from "@/lib/watchlist";
import { POSITION_LABEL, type Player } from "@fundxi/core/domain/player/player";
import { match_event_badges, type MatchEventKind } from "@fundxi/core/domain/player/player_match_view";
import { build_tournament_stat_groups, key_tournament_stats, type StatSemantic } from "@fundxi/core/domain/player/player_stat_view";
import type { PlayerValuation } from "@fundxi/core/domain/market/player_valuation";
import { compute_portfolio_share } from "@fundxi/core/domain/portfolio/portfolio_metrics";
import type { PlayerTournamentStat } from "@fundxi/core/infrastructure/repositories/player_stats_repository";
import type { PlayerMatchEntry } from "@fundxi/core/infrastructure/repositories/player_matches_repository";
import type { PricePoint } from "@fundxi/core/infrastructure/repositories/valuations_repository";

import { useAuth } from "@/components/AuthContext";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PerformanceChart } from "@/components/PerformanceChart";
import { TickValue } from "@/components/TickValue";
import { TradeSheet } from "@/components/TradeSheet";
import { useLiveRefetch, usePlayerLiveVersion } from "@/components/live";
import { color_for_sign, fmt_eur_from_m, fmt_eur_m, fmt_eur_m_signed, fmt_shares, fmt_signed_pct } from "@/lib/format";
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

  // Tap a fixture row in the match log → close the sheet and push the match view.
  const open_match = (fixture_id: number) => {
    sheet_ref.current?.close();
    router.push(`/match/${fixture_id}`);
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
          {player && (
            <PlayerDetail player={player} on_open_team={open_team} on_open_match={open_match} trade_version={trade_version} />
          )}
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
  on_open_match,
  trade_version,
}: {
  player: Player;
  on_open_team: (team_id: string) => void;
  on_open_match: (fixture_id: number) => void;
  trade_version: number;
}) {
  const team = teams_api.get(player.team_id);
  const valuation = valuations_api.get_for_player(player.id);

  const [price_history, set_price_history] = useState<PricePoint[] | null>(null);
  const [stats, set_stats] = useState<PlayerTournamentStat | null | undefined>(undefined);
  // Valuation / Statistics live in a single tabbed slot so the (large) stat
  // families don't push the rest of the sheet down. The price chart sits
  // INSIDE the Valuation tab, so switching tabs never shifts it.
  const [tab, set_tab] = useState<"valuation" | "statistics">("valuation");

  useEffect(() => {
    let cancelled = false;
    set_price_history(null);
    set_stats(undefined);
    set_tab("valuation");
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
      <Header player={player} stats={stats} team_color={team?.color ?? "#888"} team_name={team?.name ?? "?"} team_flag={team?.flag} team_flag_url={team?.flag_url} on_open_team={() => on_open_team(player.team_id)} />

      <View style={styles.maintabs}>
        {(["valuation", "statistics"] as const).map(t => {
          const on = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => {
                void Haptics.selectionAsync();
                set_tab(t);
              }}
              style={[styles.maintab, on && styles.maintab_on]}
            >
              <Text style={[styles.maintab_label, on && styles.maintab_label_on]}>
                {t === "valuation" ? "Valuation" : "Statistics"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === "valuation" ? (
        <>
          <ValuationRibbon player_id={player.id} valuation={valuation} stats={stats} refresh={trade_version} />
          <PriceChart price_history={price_history} />
          <YourPosition player={player} refresh={trade_version} />
        </>
      ) : stats != null ? (
        <StatisticsCard stats={stats} />
      ) : (
        <Text style={styles.tab_empty}>
          {stats === undefined ? "loading stats…" : "No stats yet — this player hasn't featured."}
        </Text>
      )}

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

      <MatchLog player_id={player.id} on_open_match={on_open_match} />
    </View>
  );
}

function Header({
  player,
  stats,
  team_color,
  team_name,
  team_flag,
  team_flag_url,
  on_open_team,
}: {
  player: Player;
  stats: PlayerTournamentStat | null | undefined;
  team_color: string;
  team_name: string;
  team_flag?: string;
  team_flag_url?: string;
  on_open_team: () => void;
}) {
  const position = player.detailed_position ?? POSITION_LABEL[player.position];
  const watched = useWatchlist().has(player.id);
  return (
    <View style={styles.header}>
      {/* Watch toggle on its own top-left line (mirrors the close X on the
          top-right) so it never shifts the photo. */}
      <Pressable
        onPress={() => watchlist.toggle(player.id)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={watched ? "Remove from watchlist" : "Add to watchlist"}
        style={[styles.watch_btn, watched && styles.watch_btn_on]}
      >
        <Text style={[styles.watch_star, watched && styles.watch_star_on]}>{watched ? "★" : "☆"}</Text>
      </Pressable>
      <View style={styles.header_top}>
        <PlayerAvatar
          image_path={player.image_path}
          jersey_number={player.jersey_number}
          team_color={team_color}
          size={72}
          fit="contain"
          style={styles.photo}
        />
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
      {/* Tournament totals — compact strip, same source/format as the Statistics panel. */}
      <View style={styles.stat_grid}>
        {key_tournament_stats(stats, player.position).map(item => {
          const c = statistics_color(item.semantic);
          return (
            <View key={item.label} style={styles.stat_cell}>
              <Text style={[styles.bio_value, !item.parts && c ? { color: c } : null]} numberOfLines={1}>
                {item.parts
                  ? item.parts.map((p, i) => {
                      const pc = statistics_color(p.semantic);
                      return (
                        <Text key={i} style={pc ? { color: pc } : null}>
                          {p.text}
                        </Text>
                      );
                    })
                  : item.value}
              </Text>
              <Text style={styles.bio_label}>{item.label}</Text>
            </View>
          );
        })}
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
            label: `${new Date(p.ts).toLocaleDateString(undefined, { day: "2-digit", month: "short" })} · ${new Date(p.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`,
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

function MatchLog({ player_id, on_open_match }: { player_id: number; on_open_match: (fixture_id: number) => void }) {
  const [matches, set_matches] = useState<PlayerMatchEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    set_matches(null);
    players_api.get_matches(player_id).then(
      m => !cancelled && set_matches(m),
      () => !cancelled && set_matches([]),
    );
    return () => {
      cancelled = true;
    };
  }, [player_id]);

  return (
    <View style={styles.matchlog}>
      <View style={styles.matchlog_head}>
        <Text style={styles.section_title}>Fixtures</Text>
        <Text style={styles.matchlog_count}>{matches === null ? "loading…" : `${matches.length} appearances`}</Text>
      </View>

      {matches === null ? (
        <Text style={styles.ml_loading}>loading…</Text>
      ) : matches.length === 0 ? (
        <Text style={styles.ml_loading}>No matches played yet for this player.</Text>
      ) : (
        matches.map(m => <MatchRow key={m.fixture_id} m={m} on_open_match={on_open_match} />)
      )}
    </View>
  );
}

function MatchRow({ m, on_open_match }: { m: PlayerMatchEntry; on_open_match: (fixture_id: number) => void }) {
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
    <Pressable
      onPress={() => on_open_match(m.fixture_id)}
      style={({ pressed }) => [styles.ml_row, live && styles.ml_row_live, pressed && styles.ml_row_pressed]}
    >
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
        <View style={styles.ml_meta_sub}>
          <Text style={styles.ml_date}>{date_label}</Text>
          {finished && <MatchEvents m={m} />}
        </View>
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
    </Pressable>
  );
}

// The player's discrete events for one fixture (goals/assists/cards from
// core.match_event). Goals/cards reuse the match glyphs; assist is a lettered
// chip (no on-brand emoji). Shared badge logic lives in player_match_view.
const _EVENT_ICON: Record<MatchEventKind, string> = { goal: "⚽", assist: "A", yellow: "🟨", red: "🟥" };

function MatchEvents({ m }: { m: PlayerMatchEntry }) {
  const badges = match_event_badges(m);
  if (badges.length === 0) return null;
  return (
    <View style={styles.ml_events}>
      {badges.map(b => (
        <View key={b.kind} style={styles.ml_event}>
          <Text style={[styles.ml_event_icon, b.kind === "assist" && styles.ml_event_assist]}>{_EVENT_ICON[b.kind]}</Text>
          {b.count > 1 && <Text style={styles.ml_event_count}>{b.count}</Text>}
        </View>
      ))}
    </View>
  );
}

function YourPosition({ player, refresh }: { player: Player; refresh: number }) {
  // Single source: market_value / pnl / return come from the core metrics —
  // the SAME function the web card uses — so the two clients are aligned by
  // construction and reconcile with the holdings list + AUM.
  // `closed_bump` re-reads the (cache-refreshed) metrics after a Close so the
  // card flips to its empty state without leaving the sheet.
  const [closed_bump, set_closed_bump] = useState(0);
  const [closing, set_closing] = useState(false);
  const metrics = useMemo(() => portfolio_api.get_holding_metrics(player.id), [player.id, refresh, closed_bump]);
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

  const { shares, display_shares, price_per_share, avg_buy_per_share, current_price, market_value, pnl, return_pct } =
    metrics!;
  const portfolio_pct = compute_portfolio_share(market_value, totals.total_value);
  const is_long = shares > 0;

  // Close = trade the exact held quantity in the opposite direction (sell a
  // long, buy back a short). Confirms first; reduces exposure so it never trips
  // the cap/margin. trades_api.execute refreshes the shared caches.
  const close_position = () => {
    Alert.alert("Close position", `Close your ${is_long ? "long" : "short"} on ${player.name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Close",
        style: "destructive",
        onPress: () => {
          set_closing(true);
          trades_api
            .execute({ player_id: player.id, kind: is_long ? "sell" : "buy", shares: Math.abs(shares), price: current_price })
            .then(() => set_closed_bump(b => b + 1))
            .catch(() => Alert.alert("Couldn't close", "The order failed. Please try again."))
            .finally(() => set_closing(false));
        },
      },
    ]);
  };

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
        <SmallKpi label="Shares" value={fmt_shares(Math.abs(display_shares))} />
        <SmallKpi label="Price /sh" value={fmt_eur_from_m(price_per_share)} />
        <SmallKpi label="Value" value={fmt_eur_m(market_value)} />
        <SmallKpi label="% portfolio" value={`${portfolio_pct.toFixed(1)}%`} />
        <SmallKpi label="Entry /sh" value={fmt_eur_from_m(avg_buy_per_share)} />
        <SmallKpi label="Mkt cap" value={fmt_eur_m(current_price)} />
        <SmallKpi label="P&L" value={fmt_eur_m_signed(pnl)} color={color_for_sign(pnl)} />
        <SmallKpi label="Return" value={fmt_signed_pct(return_pct, 1)} color={color_for_sign(return_pct)} />
      </View>
      <Pressable
        style={[styles.close_pos_btn, closing && { opacity: 0.5 }]}
        onPress={close_position}
        disabled={closing}
        accessibilityRole="button"
      >
        <Text style={styles.close_pos_label}>{closing ? "Closing…" : "Close position"}</Text>
      </Pressable>
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

// Grouped tournament-stats panel — mirrors the web PlayerStatistics so both
// clients render the SAME families in the SAME order (parity invariant). Only
// the StatSemantic → palette mapping is client-specific. Each family shows
// only the KPIs the provider actually sent.
function statistics_color(semantic: StatSemantic): string | undefined {
  switch (semantic) {
    case "good":
      return palette.positive;
    case "warn":
      return palette.cardYellow;
    case "danger":
      return palette.negative;
    default:
      return undefined;
  }
}

function StatisticsCard({ stats }: { stats: PlayerTournamentStat }) {
  const groups = build_tournament_stat_groups(stats);
  if (groups.length === 0) return null;
  return (
    <SectionCard title="Statistics">
      {groups.map(group => (
        <View key={group.title} style={styles.stat_group}>
          <Text style={styles.stat_group_label}>{group.title}</Text>
          <View style={styles.kpi_grid}>
            {group.items.map(item => (
              <SmallKpi key={item.label} compact label={item.label} value={item.value} color={statistics_color(item.semantic)} />
            ))}
          </View>
        </View>
      ))}
    </SectionCard>
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
  watch_btn: {
    alignSelf: "flex-start",
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  watch_btn_on: { backgroundColor: "rgba(255,255,255,0.08)" },
  identity: { flex: 1, minWidth: 0 },
  watch_star: { fontSize: 14, color: text.secondary },
  watch_star_on: { color: text.primary },
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
  stat_grid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  stat_cell: {
    flexGrow: 1,
    flexBasis: "30%",
    backgroundColor: surface.cardSoft,
    borderWidth: 1,
    borderColor: border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    alignItems: "center",
  },
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
  stat_group: { gap: 6, marginTop: 4 },
  stat_group_label: { fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.4)", letterSpacing: 0.5, textTransform: "uppercase" },
  // Valuation / Statistics segmented control (one slot, no layout shift).
  maintabs: {
    flexDirection: "row",
    gap: 4,
    padding: 3,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 9,
  },
  maintab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 7 },
  maintab_on: { backgroundColor: "rgba(255,255,255,0.08)" },
  maintab_label: { fontSize: 12, fontWeight: "700", color: text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" },
  maintab_label_on: { color: "#fff" },
  tab_empty: { color: text.tertiary, fontSize: 13, fontWeight: "600", paddingVertical: 28, textAlign: "center" },
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
  ml_row_pressed: { opacity: 0.6 },
  ml_status: { width: 34, alignItems: "flex-start" },
  ml_live: { backgroundColor: palette.actionSell, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },
  ml_live_label: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 0.6 },
  ml_soon: { fontSize: 10, fontWeight: "700", color: text.tertiary, letterSpacing: 0.5 },
  ml_result: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  ml_flag: { width: 22, height: 22 },
  ml_flag_emoji: { fontSize: 16, width: 22 },
  ml_meta: { flex: 1, minWidth: 0 },
  ml_opp: { fontSize: 12, fontWeight: "700", color: "#fff" },
  ml_meta_sub: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 1 },
  ml_date: { fontSize: 10, color: text.tertiary },
  ml_events: { flexDirection: "row", alignItems: "center", gap: 6 },
  ml_event: { flexDirection: "row", alignItems: "center", gap: 1 },
  ml_event_icon: { fontSize: 11 },
  ml_event_assist: { fontSize: 10, fontWeight: "800", color: palette.positive },
  ml_event_count: { fontFamily: mono, fontSize: 10, fontWeight: "800", color: text.secondary },
  ml_score: { fontFamily: mono, fontSize: 12, fontWeight: "800", color: "#fff" },
  ml_pct: { fontFamily: mono, fontSize: 11, fontWeight: "800", minWidth: 56, textAlign: "right" },

  position_card: { backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 10, overflow: "hidden" },
  position_head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)", backgroundColor: "rgba(255,255,255,0.025)" },
  position_title: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.55)", letterSpacing: 0.5, textTransform: "uppercase" },
  position_badge: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  position_badge_label: { fontSize: 10, fontWeight: "800", color: text.tertiary, letterSpacing: 0.5 },
  position_empty: { padding: 14, fontSize: 12, color: text.tertiary, lineHeight: 18 },
  close_pos_btn: {
    marginHorizontal: 10,
    marginBottom: 10,
    marginTop: 8,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: with_alpha(palette.negative, 0.4),
    backgroundColor: with_alpha(palette.negative, 0.08),
  },
  close_pos_label: { color: palette.negative, fontSize: 13, fontWeight: "800" },

  trade_row: { flexDirection: "row", gap: 8, marginTop: 4 },
  trade_btn: { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: "center" },
  trade_label: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
