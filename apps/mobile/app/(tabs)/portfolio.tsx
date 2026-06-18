// Portfolio — RN port of apps/web/src/ui/pages/portfolio/PortfolioPage.tsx,
// laid out from the "Trading Dashboard" mockup (context/Pictures review).
//
// Mobile single-column flow: two hero stat cards (Total value | P&L) → value
// chart with a period selector → secondary KPI grid (3×2, iconised) →
// Positions/Trades → Analytics (Exposure / Win-Loss / Allocation). Same data,
// same live sync as the web 2-column desktop board. Positions open the player
// sheet; a "Close all" button flattens the whole book at market price (native
// Alert confirm). The web's multi-select "Close selected" is not yet ported.

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { players_api } from "@fundxi/core/api/players_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { trades_api } from "@fundxi/core/api/trades_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import { POSITION_ABBR, type Player } from "@fundxi/core/domain/player/player";
import { compute_portfolio_breakdowns } from "@fundxi/core/domain/portfolio/portfolio_breakdown";
import type { HoldingDetail } from "@fundxi/core/application/portfolio_service";
import type { HistoryRange } from "@fundxi/core/infrastructure/repositories/portfolio_history_repository";
import { chart_category_ramp } from "@fundxi/core/design/palette";

import { Donut } from "@/components/Donut";
import { KpiIcon, type KpiIconName } from "@/components/KpiIcon";
import { PerformanceChart, type PerfPoint } from "@/components/PerformanceChart";
import { PlayerAvatar as PlayerAvatarBase } from "@/components/PlayerAvatar";
import { TickValue } from "@/components/TickValue";
import { PlayerSheet, type PlayerSheetHandle } from "@/components/PlayerSheet";
import { useLiveRefetch, usePricesLiveVersion } from "@/components/live";
import { useRefresh } from "@/components/use_refresh";
import { color_for_sign, fmt_eur_from_m, fmt_eur_m, fmt_eur_m_signed, fmt_shares, fmt_signed_pct } from "@/lib/format";
import { mono, palette, position_color, text } from "@/theme/tokens";

// Flat detail panel: four peer tabs, max one sub-level (Allocation only).
// "Stats" groups Exposure (positioning) + Win/Loss (outcome) — both small,
// shown stacked, no sub-tabs. "Allocation" holds the three breakdowns directly,
// so there is no Analytics → Allocation → breakdown chain anymore.
type PositionsTab = "positions" | "trades" | "stats" | "allocation";
// "Role" (player position FW/MF/DF/GK) is named so it isn't confused with
// portfolio positions.
type AllocTab = "team" | "role" | "age";

const ALLOC_TABS: { k: AllocTab; label: string }[] = [
  { k: "team", label: "Team" },
  { k: "role", label: "Role" },
  { k: "age", label: "Age" },
];

// Chart period selector — UI labels mapped to the only ranges the backend
// history endpoint serves (24h | 7d | 30d | all). No 3M/YTD: the BFF doesn't
// expose them, and inventing client-side buckets would break the
// data-sourcing rule (CLAUDE.md). Matches the mockup's 1D/1W/1M/All exactly.
const PERIODS: { k: HistoryRange; label: string }[] = [
  { k: "24h", label: "1D" },
  { k: "7d", label: "1W" },
  { k: "30d", label: "1M" },
  { k: "all", label: "All" },
];

// Allocation breakdown ramp — shared brand-blue categorical token (see
// packages/core/src/design/palette.ts), aligned with the logo's blue.
const CHART_PALETTE = chart_category_ramp;

// Positions / Trade-history list — fixed viewport with its own scroll, so the
// page height stays stable whichever tab is active (Positions ~4 rows vs Trade
// history ~14 rows would otherwise make the whole screen jump). ~4 rows tall.
const LIST_HEIGHT = 440;

function fmt_short_date(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export default function PortfolioScreen() {
  const sheet_ref = useRef<PlayerSheetHandle>(null);
  // Positions / Trades / Analytics share one segmented control + one fixed
  // viewport (see the detail panel below) — Analytics is no longer a separate
  // bottom section, so there is nothing to scroll into view.
  const [positions_tab, set_positions_tab] = useState<PositionsTab>("positions");
  const [period, set_period] = useState<HistoryRange>("all");
  // Allocation shows one breakdown at a time via its own sub-tabs.
  const [alloc_tab, set_alloc_tab] = useState<AllocTab>("team");
  const [data_version, set_data_version] = useState(0);
  const [closing, set_closing] = useState(false);

  // /api/portfolio is auth-gated and mobile has no auth yet (401) — swallow
  // the failure so it doesn't surface as an unhandled rejection; the screen
  // then just shows an empty portfolio until auth lands.
  useEffect(() => portfolio_api.subscribe(() => set_data_version(v => v + 1)), []);
  useEffect(() => {
    void portfolio_api.refresh().then(() => set_data_version(v => v + 1)).catch(() => {});
  }, []);
  useLiveRefetch(usePricesLiveVersion(), () => {
    void valuations_api.refresh().then(() => set_data_version(v => v + 1)).catch(() => {});
  });
  const { refreshing, onRefresh } = useRefresh(() =>
    Promise.all([portfolio_api.refresh(), valuations_api.refresh()])
      .then(() => set_data_version(v => v + 1))
      .catch(() => {}),
  );

  const holdings = useMemo(() => portfolio_api.get_holdings(), [data_version]);
  const trades = useMemo(() => portfolio_api.list_trades(), [data_version]);

  // Bulk-close: flatten every open position to zero at its current market
  // price. Longs are sold, shorts are bought back to cover — direction is
  // derived per position by the shared close_positions use case. Native Alert
  // confirm (mobile parity with the web ClosePositionsDialog's confirm step).
  const close_all = () => {
    if (closing || holdings.length === 0) return;
    const n = holdings.length;
    Alert.alert("Close all positions?", `This flattens ${n} position${n > 1 ? "s" : ""} at market price.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Close all",
        style: "destructive",
        onPress: () => {
          set_closing(true);
          trades_api
            .close_positions(holdings.map(h => ({ player_id: h.player_id, shares: h.shares, price: h.current_price })))
            .then(outcome => {
              set_data_version(v => v + 1);
              Alert.alert(
                "Positions closed",
                outcome.failed.length === 0
                  ? `Closed ${outcome.closed.length} position${outcome.closed.length > 1 ? "s" : ""}.`
                  : `Closed ${outcome.closed.length}, ${outcome.failed.length} failed.`,
              );
            })
            .catch((e: unknown) => Alert.alert("Close failed", e instanceof Error ? e.message : String(e)))
            .finally(() => set_closing(false));
        },
      },
    ]);
  };
  const totals = useMemo(() => portfolio_api.get_totals(), [data_version]);
  const total_value = totals.total_value;
  // Allocation slices + win-rate: single source shared with web
  // (packages/core domain). The UI only maps these to display rows below —
  // no calculation leaks here. See COHERENCE-INVARIANT.
  const breakdowns = useMemo(
    () => compute_portfolio_breakdowns(holdings, id => teams_api.get(id)),
    [holdings],
  );
  const win_rate = breakdowns.win_rate;
  // Best open position by P&L — the "top position" KPI. Unrealized (we have no
  // realized-P&L-per-closed-trade figure), so it's labelled accordingly.
  const top_position_pnl = useMemo(
    () => (holdings.length > 0 ? Math.max(...holdings.map(h => h.pnl)) : null),
    [holdings],
  );

  const [perf, set_perf] = useState<PerfPoint[]>([]);
  useEffect(() => {
    let cancelled = false;
    void portfolio_api
      .fetch_history(period)
      .then(dto => {
        if (cancelled) return;
        set_perf(
          dto.points.map(p => ({
            v: p.value,
            pnl: p.pnl_vs_open,
            // Epoch ms drives the chart's time x-axis (short HH:MM / DD MMM ticks).
            ts: new Date(p.ts).getTime(),
            // Date label for the scrub tooltip (web parity: shows the date).
            label: new Date(p.ts).toLocaleString(undefined, {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }),
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [data_version, period]);
  // Perf since the portfolio opened — the SINGLE truth (Total value card + chart):
  // live total value vs the all-time opening value. `pnl_vs_open` is always vs the
  // all-time open (never the selected window), so open_value = v − pnl recovers the
  // starting capital regardless of period. Realized + unrealized, live.
  const inception_value = perf.length > 0 ? perf[0]!.v - (perf[0]!.pnl ?? 0) : null;
  const pnl_since_inception = inception_value != null ? total_value - inception_value : null;
  const pnl_since_inception_pct =
    inception_value != null && inception_value !== 0
      ? ((total_value - inception_value) / inception_value) * 100
      : null;

  const sorted_holdings = useMemo(() => [...holdings].sort((a, b) => b.market_value - a.market_value), [holdings]);
  const sorted_trades = useMemo(() => [...trades].sort((a, b) => b.date.localeCompare(a.date)), [trades]);

  const by_team = breakdowns.by_team.map(t => ({ label: `${t.flag} ${t.name}`, v: t.value, pct: t.pct }));
  const by_position = breakdowns.by_position.map(p => ({ label: p.label, v: p.value, pct: p.pct }));
  const by_age = breakdowns.by_age.map(a => ({ label: a.label, v: a.value, pct: a.pct }));

  const with_color = <T extends { v: number }>(items: T[]) =>
    items.map((it, i) => ({ ...it, color: CHART_PALETTE[i] ?? CHART_PALETTE[CHART_PALETTE.length - 1] }));

  const pnl_color = color_for_sign(pnl_since_inception);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {/* Hero — two distinct headline reads (no duplicated P&L):
            Total value (net worth + P&L since open) and Buying power (free cash
            still deployable). */}
        <View style={styles.hero_row}>
          <View style={styles.hero_card}>
            <Text style={styles.hero_label}>Total value</Text>
            <Text style={styles.hero_value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {fmt_eur_m(total_value)}
            </Text>
            <Text style={[styles.hero_delta, { color: pnl_color }]} numberOfLines={1}>
              {pnl_since_inception != null && pnl_since_inception_pct != null
                ? `${fmt_eur_m_signed(pnl_since_inception)} (${fmt_signed_pct(pnl_since_inception_pct, 1)})`
                : "—"}
            </Text>
            <Text style={styles.hero_note}>Since inception</Text>
          </View>
          <View style={styles.hero_card}>
            <Text style={styles.hero_label}>Buying power</Text>
            <Text style={styles.hero_value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {fmt_eur_m(totals.buying_power)}
            </Text>
            <Text style={[styles.hero_delta, { color: text.secondary }]} numberOfLines={1}>
              {fmt_eur_m(totals.cash)} cash
            </Text>
            <Text style={styles.hero_note}>Deployable now</Text>
          </View>
        </View>

        {/* Portfolio value chart with a period selector (1D/1W/1M/All). */}
        <View style={styles.card}>
          <View style={styles.value_head}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.value_title}>Portfolio value</Text>
            </View>
            <View style={styles.period_row}>
              {PERIODS.map(p => {
                const on = period === p.k;
                return (
                  <Pressable key={p.k} onPress={() => set_period(p.k)} style={[styles.period_btn, on && styles.period_btn_on]}>
                    <Text style={[styles.period_label, on && styles.period_label_on]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {perf.length > 0 ? (
            <PerformanceChart
              data={perf}
              height={176}
              format_value={p => fmt_eur_m(p.v)}
              format_axis={v => `€${v.toFixed(1)}M`}
              min_span_pct={5}
              show_axes
              show_last_value
            />
          ) : (
            <Text style={styles.chart_empty}>No history yet</Text>
          )}
        </View>

        {/* Secondary KPI grid — 3×2 iconised cells. Lower visual weight than the
            hero; supporting figures the user scans after the headline. */}
        <View style={styles.kpi_grid}>
          <KpiCard icon="invested" label="Invested" value={fmt_eur_m(totals.gross_cost)} />
          <KpiCard icon="positions" label="Positions" value={String(holdings.length)} />
          <KpiCard icon="trades" label="Trades" value={String(trades.length)} />
          <KpiCard icon="winrate" label="Win rate" value={win_rate == null ? "—" : `${win_rate.toFixed(0)}%`} />
          <KpiCard
            icon="top"
            label="Top position"
            value={top_position_pnl == null ? "—" : fmt_eur_m_signed(top_position_pnl)}
            value_color={top_position_pnl == null ? undefined : color_for_sign(top_position_pnl)}
            icon_color={top_position_pnl == null ? undefined : color_for_sign(top_position_pnl)}
          />
        </View>

        {/* Portfolio detail — one flat segmented control (Positions / Trades /
            Stats / Allocation) over a single fixed-height viewport. Max one
            sub-level (Allocation's Team/Role/Age); no Analytics → Allocation →
            breakdown chain, no page-height jump, no deep scroll. */}
        <View>
          <View style={styles.tabbar}>
            {(
              [
                { k: "positions", label: "Positions", count: holdings.length },
                { k: "trades", label: "Trades", count: trades.length },
                { k: "stats", label: "Stats" },
                { k: "allocation", label: "Allocation" },
              ] as { k: PositionsTab; label: string; count?: number }[]
            ).map(t => {
              const on = positions_tab === t.k;
              return (
                <Pressable key={t.k} onPress={() => set_positions_tab(t.k)} style={[styles.tabbtn, on && styles.tabbtn_on]}>
                  <Text style={[styles.tabbtn_label, on && styles.tabbtn_label_on]} numberOfLines={1}>
                    {t.label}
                    {t.count !== undefined ? (
                      <Text style={[styles.tabbtn_count, on && styles.tabbtn_count_on]}> {t.count}</Text>
                    ) : null}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Allocation sub-tabs pinned above the viewport so switching
              breakdown never scrolls the panel back up. */}
          {positions_tab === "allocation" && (
            <View style={[styles.atab_row, styles.atab_row_panel]}>
              {ALLOC_TABS.map(t => {
                const on = alloc_tab === t.k;
                return (
                  <Pressable key={t.k} onPress={() => set_alloc_tab(t.k)} style={[styles.atab, on && styles.atab_on]}>
                    <Text style={[styles.atab_label, on && styles.atab_label_on]} numberOfLines={1}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Fixed-height viewport + inner scroll → the page never jumps when
              switching between Positions, Trades, Stats and Allocation. */}
          <View style={styles.list_box}>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={styles.list_scroll}>
              {positions_tab === "positions" ? (
                holdings.length === 0 ? (
                  <Text style={styles.list_empty}>No open positions.</Text>
                ) : (
                  <>
                    <View style={styles.close_all_row}>
                      <Pressable
                        onPress={close_all}
                        disabled={closing}
                        style={({ pressed }) => [styles.close_all_btn, pressed && styles.close_all_pressed, closing && styles.close_all_disabled]}
                        accessibilityRole="button"
                      >
                        <Text style={styles.close_all_text}>{closing ? "Closing…" : "Close all"}</Text>
                      </Pressable>
                    </View>
                    {sorted_holdings.map(h => (
                      <PositionRow key={h.player_id} h={h} on_open={() => sheet_ref.current?.open(h.player)} />
                    ))}
                  </>
                )
              ) : positions_tab === "trades" ? (
                trades.length === 0 ? (
                  <Text style={styles.list_empty}>No trades yet.</Text>
                ) : (
                  sorted_trades.map(t => <TradeRow key={t.id} trade={t} />)
                )
              ) : positions_tab === "stats" ? (
                <View style={styles.stats_stack}>
                  <ExposureCard long_value={totals.long_value} short_value={totals.short_value} />
                  <WinLossCard holdings={holdings} />
                </View>
              ) : (
                <>
                  {alloc_tab === "team" && <BreakdownCard title="By team" items={with_color(by_team)} chart="bars" />}
                  {alloc_tab === "role" && <BreakdownCard title="By role" items={with_color(by_position)} chart="pie" />}
                  {alloc_tab === "age" && <BreakdownCard title="By age" items={with_color(by_age)} chart="pie" />}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </ScrollView>
      <PlayerSheet ref={sheet_ref} />
    </View>
  );
}

function PlayerAvatar({ player, size }: { player: Player; size: number }) {
  const team = teams_api.get(player.team_id);
  return (
    <PlayerAvatarBase
      image_path={player.image_path}
      jersey_number={player.jersey_number}
      team_color={team?.color ?? "#666"}
      size={size}
      fit="contain"
      style={[styles.avatar, { width: size, height: size }]}
    />
  );
}

function PositionRow({ h, on_open }: { h: HoldingDetail; on_open: () => void }) {
  const team = teams_api.get(h.player.team_id);
  const is_long = h.shares > 0;
  const opened = portfolio_api.opened_at(h.player_id);
  const opened_label = opened ? fmt_short_date(opened.date) : "—"; // date only, no time
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.row_pressed]} onPress={on_open} accessibilityRole="button">
      <View style={styles.row_top}>
        <PlayerAvatar player={h.player} size={36} />
        <View style={styles.row_identity}>
          <View style={styles.row_name_line}>
            <Text style={styles.row_jersey}>{h.player.jersey_number}</Text>
            <Text style={styles.row_name} numberOfLines={1}>{h.player.name}</Text>
            <View style={[styles.side, { backgroundColor: is_long ? palette.positive : palette.negative }]}>
              <Text style={styles.side_label}>{is_long ? "LONG" : "SHORT"}</Text>
            </View>
          </View>
          <Text style={styles.row_team} numberOfLines={1}>
            {team?.flag} {team?.name} <Text style={{ color: position_color[h.player.position] }}>· {POSITION_ABBR[h.player.position]}</Text>
          </Text>
        </View>
        {/* Player market data — the player's own value, beside the name. */}
        <View style={styles.row_market}>
          <TickValue value={h.current_price}>
            <Text style={styles.mkt_cap}>{fmt_eur_m(h.current_price)}</Text>
          </TickValue>
          <Text style={styles.mkt_price}>{fmt_eur_from_m(h.price_per_share)}/sh</Text>
        </View>
      </View>

      {/* Your position: date · shares · entry · % of portfolio · P&L. */}
      <View style={[styles.stats_row, styles.row_stats_mt]}>
        <StripCell label="Opened" value={opened_label} />
        <StripCell label="Shares" value={fmt_shares(Math.abs(h.display_shares))} />
        <StripCell label="Entry price" value={fmt_eur_from_m(h.avg_buy_per_share)} />
        <StripCell
          label="Exposure"
          value={fmt_eur_m(Math.abs(h.market_value))}
          sub={`${Math.abs(h.portfolio_pct).toFixed(1)}%`}
        />
        <StripCell
          label="P&L"
          value={fmt_eur_m_signed(h.pnl)}
          sub={fmt_signed_pct(h.return_pct, 1)}
          color={color_for_sign(h.pnl)}
        />
      </View>
    </Pressable>
  );
}

function StripCell({
  label,
  value,
  sub,
  pulse,
  color,
}: {
  label: string;
  value: string;
  sub?: string; // optional second line (e.g. P&L percent under the amount)
  pulse?: number;
  color?: string;
}) {
  return (
    <View style={styles.strip_cell}>
      <Text style={styles.strip_label} numberOfLines={1}>{label}</Text>
      {pulse !== undefined ? (
        <TickValue value={pulse}>
          <Text style={[styles.strip_value, color ? { color } : null]} numberOfLines={1}>{value}</Text>
        </TickValue>
      ) : (
        <Text style={[styles.strip_value, color ? { color } : null]} numberOfLines={1}>{value}</Text>
      )}
      {sub ? <Text style={[styles.strip_sub, color ? { color } : null]} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

function TradeRow({ trade: t }: { trade: import("@fundxi/core/domain/portfolio/trade").Trade }) {
  const team = teams_api.get(t.team_id);
  const player = players_api.get(t.player_id);
  const is_buy = t.kind === "buy";
  return (
    <View style={styles.row}>
      <View style={styles.row_top}>
        {player ? <PlayerAvatar player={player} size={32} /> : <View style={[styles.avatar, { width: 32, height: 32 }]} />}
        <View style={styles.row_identity}>
          <View style={styles.row_name_line}>
            {player && <Text style={styles.row_jersey}>{player.jersey_number}</Text>}
            <Text style={styles.row_name} numberOfLines={1}>{t.player_name}</Text>
            <View style={[styles.kind, { backgroundColor: is_buy ? palette.actionBuy : palette.actionSell }]}>
              <Text style={styles.kind_label}>{t.kind.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.row_team} numberOfLines={1}>{team?.flag} {team?.name}</Text>
        </View>
        <View style={styles.row_pnl}>
          <Text style={styles.trade_total}>{fmt_eur_m(t.total)}</Text>
          <Text style={styles.trade_date}>{fmt_short_date(t.date)}</Text>
        </View>
      </View>
      <View style={styles.row_divider} />
      <View style={styles.stats_row}>
        <StripCell label="Shares" value={fmt_shares(portfolio_api.to_display_shares(t.shares))} />
        <StripCell label="Price /sh" value={fmt_eur_from_m(portfolio_api.to_price_per_share(t.price))} />
        <StripCell label="Total" value={fmt_eur_m(t.total)} />
      </View>
    </View>
  );
}

function ExposureCard({ long_value, short_value }: { long_value: number; short_value: number }) {
  // Gross long vs gross short market value (single source: compute_portfolio_totals).
  const total = long_value + short_value || 1;
  const long_pct = (long_value / total) * 100;
  const short_pct = (short_value / total) * 100;
  const net = long_value - short_value;
  return (
    <Section title="Position Long / Short">
      <View style={styles.bar}>
        {long_pct > 0 && (
          <View style={[styles.bar_seg, { flex: long_pct, backgroundColor: palette.positive }]}>
            <Text style={styles.bar_label}>{long_pct.toFixed(0)}%</Text>
          </View>
        )}
        {short_pct > 0 && (
          <View style={[styles.bar_seg, { flex: short_pct, backgroundColor: palette.negative }]}>
            <Text style={styles.bar_label}>{short_pct.toFixed(0)}%</Text>
          </View>
        )}
      </View>
      <View style={styles.cells3}>
        <Cell label="Long" value={fmt_eur_m(long_value)} />
        <Cell label="Short" value={fmt_eur_m(short_value)} />
        <Cell label="Net" value={fmt_eur_m_signed(net)} color={color_for_sign(net)} />
      </View>
    </Section>
  );
}

function WinLossCard({ holdings }: { holdings: HoldingDetail[] }) {
  const winners = holdings.filter(h => h.pnl > 0).length;
  const losers = holdings.filter(h => h.pnl < 0).length;
  const flat = holdings.length - winners - losers;
  const total = holdings.length || 1;
  return (
    <Section title="Trades Wins / Losses">
      <View style={styles.bar}>
        {winners > 0 && (
          <View style={[styles.bar_seg, { flex: winners / total, backgroundColor: palette.positive }]}>
            <Text style={styles.bar_label}>{((winners / total) * 100).toFixed(0)}%</Text>
          </View>
        )}
        {flat > 0 && (
          <View style={[styles.bar_seg, { flex: flat / total, backgroundColor: "rgba(255,255,255,0.06)" }]}>
            <Text style={[styles.bar_label, { color: text.secondary }]}>{((flat / total) * 100).toFixed(0)}%</Text>
          </View>
        )}
        {losers > 0 && (
          <View style={[styles.bar_seg, { flex: losers / total, backgroundColor: palette.negative }]}>
            <Text style={styles.bar_label}>{((losers / total) * 100).toFixed(0)}%</Text>
          </View>
        )}
      </View>
      <View style={styles.cells3}>
        <Cell label="Winners" value={String(winners)} />
        <Cell label="Flat" value={String(flat)} />
        <Cell label="Losers" value={String(losers)} />
      </View>
    </Section>
  );
}

interface BItem {
  label: string;
  color: string;
  pct: number;
  v: number;
}
function BreakdownCard({ title, items, chart }: { title: string; items: BItem[]; chart: "bars" | "pie" }) {
  return (
    <Section title={title}>
      {items.length === 0 ? (
        <Text style={styles.list_empty}>No holdings.</Text>
      ) : chart === "pie" ? (
        <View style={{ alignItems: "center", gap: 10 }}>
          <Donut segments={items.map(i => ({ value: i.v, color: i.color, label: i.label }))} size={120} />
          <View style={{ width: "100%" }}>
            {items.map((it, i) => (
              <View key={i} style={styles.legend_row}>
                <View style={styles.legend_left}>
                  <View style={[styles.legend_dot, { backgroundColor: it.color }]} />
                  <Text style={styles.legend_label} numberOfLines={1}>{it.label}</Text>
                </View>
                <Text style={styles.legend_pct}>{fmt_signed_pct(it.pct, 1)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {items.map((it, i) => {
            const pct = it.pct;
            const neg = Number(pct.toFixed(1)) < 0;
            return (
              <View key={i} style={{ gap: 4 }}>
                <View style={styles.bars_head}>
                  <Text style={styles.legend_label} numberOfLines={1}>{it.label}</Text>
                  <Text style={[styles.legend_pct, neg && { color: palette.negative }]}>{fmt_signed_pct(it.pct, 1)}</Text>
                </View>
                <View style={styles.bars_track}>
                  <View style={[styles.bars_fill, { width: `${Math.max(2, Math.abs(pct))}%`, backgroundColor: neg ? palette.negative : it.color }]} />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.section_title}>{title}</Text>
      <View style={{ padding: 14, gap: 12 }}>{children}</View>
    </View>
  );
}

function KpiCard({
  icon,
  label,
  value,
  value_color,
  icon_color,
}: {
  icon: KpiIconName;
  label: string;
  value: string;
  value_color?: string;
  icon_color?: string;
}) {
  return (
    <View style={styles.kpi}>
      <View style={styles.kpi_head}>
        <Text style={styles.kpi_label} numberOfLines={1}>{label}</Text>
        <KpiIcon name={icon} color={icon_color ?? palette.brandBlue} size={16} />
      </View>
      <Text style={[styles.kpi_value, value_color ? { color: value_color } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cell_label}>{label}</Text>
      <Text style={[styles.cell_value, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { padding: 16, gap: 16 },

  atab_row: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  // Allocation sub-tabs pinned between the main tabbar and the viewport.
  atab_row_panel: { marginBottom: 10 },
  // Stats tab: Exposure + Win/Loss cards stacked with breathing room.
  stats_stack: { gap: 12 },
  atab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  atab_on: { backgroundColor: palette.brandBlueSoft, borderColor: palette.brandBlue },
  atab_label: { color: text.secondary, fontSize: 12, fontWeight: "700" },
  atab_label_on: { color: "#fff" },

  // Hero — two equal headline cards. Slightly higher surface opacity + faint
  // brand-blue rim so they read as the premium primary block.
  hero_row: { flexDirection: "row", gap: 12 },
  hero_card: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.brandBlueSoft,
    borderRadius: 16,
    padding: 16,
    gap: 2,
  },
  hero_label: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: text.secondary },
  hero_value: { fontFamily: mono, fontSize: 26, lineHeight: 32, fontWeight: "800", color: "#fff", marginTop: 4 },
  hero_delta: { fontFamily: mono, fontSize: 12, fontWeight: "700", marginTop: 2 },
  hero_note: { fontSize: 10, fontWeight: "500", color: text.tertiary, marginTop: 1 },

  card: { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" },

  value_head: { flexDirection: "row", alignItems: "flex-start", padding: 16, paddingBottom: 8, gap: 10 },
  value_title: { fontSize: 14, fontWeight: "800", color: "#fff" },
  value_pct: { fontFamily: mono, fontSize: 18, fontWeight: "800", marginTop: 2 },
  // Period selector — compact pill group; active pill takes the brand blue.
  period_row: { flexDirection: "row", gap: 4, flexShrink: 0 },
  period_btn: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, backgroundColor: "rgba(255,255,255,0.03)" },
  period_btn_on: { backgroundColor: palette.brandBlueSoft },
  period_label: { fontFamily: mono, fontSize: 11, fontWeight: "700", color: text.tertiary },
  period_label_on: { color: "#fff" },
  chart_empty: { color: text.tertiary, fontSize: 12, textAlign: "center", paddingVertical: 40 },

  // Secondary KPI grid — 3 per row, wraps to a second row of 3.
  kpi_grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  // width: "31.5%" + gap 8 yields exactly 3 columns; minWidth:0 keeps long
  // values from widening a cell and breaking the column equality.
  kpi: {
    width: "31.5%",
    flexGrow: 1,
    minWidth: 0,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 6,
  },
  kpi_head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  kpi_label: { fontSize: 9, lineHeight: 12, color: text.tertiary, letterSpacing: 0.3, textTransform: "uppercase", fontWeight: "600", flexShrink: 1 },
  kpi_value: { fontFamily: mono, fontSize: 15, fontWeight: "800", color: "#fff" },

  tabbar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)", marginBottom: 10 },
  // flex:1 so the four tabs split the bar into equal segments (no overflow,
  // no horizontal scroll) and each label stays centred under its underline.
  tabbtn: { flex: 1, alignItems: "center", paddingHorizontal: 4, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabbtn_on: { borderBottomColor: palette.brandBlue },
  tabbtn_label: { fontSize: 13, fontWeight: "500", color: text.tertiary },
  tabbtn_label_on: { color: "#fff", fontWeight: "800" },
  tabbtn_count: { fontSize: 11, color: text.muted, fontWeight: "600" },
  tabbtn_count_on: { color: palette.brandBlue },
  list_box: { height: LIST_HEIGHT },
  list_scroll: { paddingBottom: 4 },
  list_empty: { padding: 24, textAlign: "center", color: text.muted, fontSize: 13 },
  close_all_row: { flexDirection: "row", justifyContent: "flex-end", paddingBottom: 8 },
  close_all_btn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: palette.negative },
  close_all_pressed: { opacity: 0.6 },
  close_all_disabled: { opacity: 0.5 },
  close_all_text: { fontFamily: mono, fontSize: 12, fontWeight: "800", color: palette.negative },

  row: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  row_pressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  row_divider: { height: 1, backgroundColor: "rgba(255,255,255,0.05)" },
  row_top: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  row_identity: { flex: 1, minWidth: 0 },
  row_name_line: { flexDirection: "row", alignItems: "center", gap: 6 },
  row_jersey: { fontFamily: mono, fontSize: 11, fontWeight: "700", color: text.tertiary },
  row_name: { fontSize: 14, fontWeight: "700", color: "#fff", flexShrink: 1 },
  side: { borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 },
  side_label: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4, color: "#fff" },
  kind: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  kind_label: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5, color: "#fff" },
  row_team: { fontSize: 11, color: text.muted, marginTop: 3 },
  row_pnl: { alignItems: "flex-end", minWidth: 70 },
  row_market: { alignItems: "flex-end", minWidth: 80, marginLeft: 8 },
  mkt_cap: { fontFamily: mono, fontSize: 13, fontWeight: "800", color: "#fff" },
  mkt_price: { fontFamily: mono, fontSize: 10.5, color: text.secondary, marginTop: 1 },
  row_stats_mt: { marginTop: 10 },
  row_pnl_label: { fontSize: 8, fontWeight: "700", color: text.muted, letterSpacing: 0.5, textTransform: "uppercase" },
  row_pnl_value: { fontFamily: mono, fontSize: 14, fontWeight: "800" },
  row_pnl_pct: { fontFamily: mono, fontSize: 11, marginTop: 1 },
  trade_total: { fontFamily: mono, fontSize: 13, fontWeight: "700", color: "#fff" },
  trade_date: { fontSize: 11, color: text.tertiary, marginTop: 1 },

  stats_row: { flexDirection: "row", columnGap: 16 },
  strip_cell: {},
  strip_label: { fontSize: 8, fontWeight: "700", color: text.muted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 2 },
  strip_value: { fontFamily: mono, fontSize: 12, fontWeight: "700", color: "#fff" },
  strip_sub: { fontFamily: mono, fontSize: 10, fontWeight: "700", marginTop: 1, color: text.secondary },

  section_title: { fontSize: 11, fontWeight: "800", color: "rgba(255,255,255,0.55)", letterSpacing: 0.5, textTransform: "uppercase", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },

  bar: { height: 22, borderRadius: 5, overflow: "hidden", flexDirection: "row", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  bar_seg: { alignItems: "center", justifyContent: "center" },
  bar_label: { fontFamily: mono, fontSize: 11, fontWeight: "800", color: "#fff" },
  cells3: { flexDirection: "row", gap: 8 },
  cell: { flex: 1, alignItems: "center", paddingVertical: 8 },
  cell_label: { fontSize: 10, color: text.tertiary, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: "600" },
  cell_value: { fontFamily: mono, fontSize: 14, fontWeight: "800", color: "#fff", marginTop: 2 },

  legend_row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5, gap: 8 },
  legend_left: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 },
  legend_dot: { width: 8, height: 8, borderRadius: 2 },
  legend_label: { fontSize: 11, fontWeight: "500", color: "#fff", flexShrink: 1 },
  legend_pct: { fontFamily: mono, fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.75)" },
  bars_head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  bars_track: { height: 5, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.04)", overflow: "hidden" },
  bars_fill: { height: "100%", borderRadius: 2 },
});
