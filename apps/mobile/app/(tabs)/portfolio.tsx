// Portfolio — RN port of apps/web/src/ui/pages/portfolio/PortfolioPage.tsx.
//
// The web layout is a 2-column desktop dashboard (perf + tables left,
// analytics rail right). On mobile everything stacks in a single column
// (CLAUDE.md): KPI grid → value chart → Positions/Trades → Exposure →
// Win/Loss → By team / position / age breakdowns. Same data, same live sync.
// The multi-select bulk-close bar is omitted (it drives trading, which is
// gated until mobile auth lands); positions still open the player sheet.

import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { players_api } from "@fundxi/core/api/players_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import { compute_period_return } from "@fundxi/core/domain/market/return";
import { POSITION_ABBR, POSITION_LABEL, type Player } from "@fundxi/core/domain/player/player";
import type { HoldingDetail } from "@fundxi/core/application/portfolio_service";

import { Donut } from "@/components/Donut";
import { PerformanceChart, type PerfPoint } from "@/components/PerformanceChart";
import { PlayerChip } from "@/components/PlayerChip";
import { TickValue } from "@/components/TickValue";
import { PlayerSheet, type PlayerSheetHandle } from "@/components/PlayerSheet";
import { useLiveRefetch, usePricesLiveVersion } from "@/components/live";
import { useRefresh } from "@/components/use_refresh";
import { color_for_sign, fmt_eur_m, fmt_eur_m_signed, fmt_shares, fmt_signed_pct } from "@/lib/format";
import { mono, palette, position_color, text } from "@/theme/tokens";

type PositionsTab = "positions" | "trades";
type AnalyticsTab = "exposure" | "winloss" | "team" | "position" | "age";

const ANALYTICS_TABS: { k: AnalyticsTab; label: string }[] = [
  { k: "exposure", label: "Exposure" },
  { k: "winloss", label: "Win / Loss" },
  { k: "team", label: "Team" },
  { k: "position", label: "Position" },
  { k: "age", label: "Age" },
];

// Chart palette in the perf-chart hue family (last entry = the theme accent).
const CHART_PALETTE = ["#7C92E5", "#5E7AD4", "#4561C2", "#3F5BBE", "#2D4AA5", "#1F3D8B", palette.chartPrimary, "#15326D"];

function fmt_short_date(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export default function PortfolioScreen() {
  const sheet_ref = useRef<PlayerSheetHandle>(null);
  const [positions_tab, set_positions_tab] = useState<PositionsTab>("positions");
  // Analytics is a single tabbed block (one chart at a time) under the main
  // KPI → chart → positions/trades flow — compact, no deep scroll.
  const [analytics_tab, set_analytics_tab] = useState<AnalyticsTab>("exposure");
  const [data_version, set_data_version] = useState(0);

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
  const totals = useMemo(() => portfolio_api.get_totals(), [data_version]);
  const total_value = totals.total_value;

  const [perf, set_perf] = useState<PerfPoint[]>([]);
  useEffect(() => {
    let cancelled = false;
    void portfolio_api
      .fetch_history("all")
      .then(dto => {
        if (cancelled) return;
        set_perf(
          dto.points.map(p => ({
            v: p.value,
            pnl: p.pnl_vs_open,
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
  }, [data_version]);
  const period_return = useMemo(() => compute_period_return(perf.map(p => p.v)), [perf]);

  const opened_by_player = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of trades) {
      const cur = map.get(t.player_id);
      if (!cur || t.date < cur) map.set(t.player_id, t.date);
    }
    return map;
  }, [trades]);

  const sorted_holdings = useMemo(() => [...holdings].sort((a, b) => b.market_value - a.market_value), [holdings]);
  const sorted_trades = useMemo(() => [...trades].sort((a, b) => b.date.localeCompare(a.date)), [trades]);

  const by_team = useMemo(() => {
    const map: Record<string, { id: string; name: string; flag: string; v: number }> = {};
    for (const h of holdings) {
      const team = teams_api.get(h.player.team_id);
      if (!team) continue;
      if (!map[team.id]) map[team.id] = { id: team.id, name: team.name, flag: team.flag, v: 0 };
      map[team.id].v += h.market_value;
    }
    return Object.values(map)
      .map(x => ({ label: `${x.flag} ${x.name}`, v: x.v, pct: ((x.v / (total_value || 1)) * 100).toFixed(1) }))
      .sort((a, b) => b.v - a.v);
  }, [holdings, total_value]);

  const by_position = useMemo(() => {
    const map: Partial<Record<string, number>> = {};
    for (const h of holdings) map[h.player.position] = (map[h.player.position] ?? 0) + h.market_value;
    return Object.entries(map)
      .map(([k, v]) => ({ label: POSITION_LABEL[k as keyof typeof POSITION_LABEL], v: v ?? 0, pct: (((v ?? 0) / (total_value || 1)) * 100).toFixed(1) }))
      .sort((a, b) => b.v - a.v);
  }, [holdings, total_value]);

  const by_age = useMemo(() => {
    const buckets = [
      { label: "U21", lo: 0, hi: 21 },
      { label: "21-25", lo: 21, hi: 26 },
      { label: "26-30", lo: 26, hi: 31 },
      { label: "31+", lo: 31, hi: 99 },
    ];
    const acc: Record<string, number> = {};
    for (const h of holdings) {
      const age = h.player.age ?? 25;
      const b = buckets.find(b => age >= b.lo && age < b.hi) ?? buckets[3];
      acc[b.label] = (acc[b.label] ?? 0) + h.market_value;
    }
    return buckets
      .filter(b => (acc[b.label] ?? 0) > 0)
      .map(b => ({ label: b.label, v: acc[b.label], pct: ((acc[b.label] / (total_value || 1)) * 100).toFixed(1) }));
  }, [holdings, total_value]);

  const with_color = <T extends { v: number }>(items: T[]) =>
    items.map((it, i) => ({ ...it, color: CHART_PALETTE[i] ?? CHART_PALETTE[CHART_PALETTE.length - 1] }));

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {/* KPI grid — two tidy rows of 4 equal cells (the web shows the same
            7 metrics in one desktop row; on mobile they wrap, evenly). */}
        <View style={styles.kpi_grid}>
          <View style={styles.kpi_row}>
            <Kpi label="Total Value" value={fmt_eur_m(total_value)} />
            <Kpi label="Cash" value={fmt_eur_m(totals.cash)} />
            <Kpi label="Invested" value={fmt_eur_m(totals.total_cost)} />
            <Kpi label="Positions" value={String(holdings.length)} />
          </View>
          <View style={styles.kpi_row}>
            <Kpi label="P&L" value={fmt_eur_m_signed(totals.pnl)} color={color_for_sign(totals.pnl)} />
            <Kpi label="Return" value={fmt_signed_pct(totals.return_pct, 1)} color={color_for_sign(totals.return_pct)} />
            <Kpi label="Trades" value={String(trades.length)} />
            <View style={{ flex: 1 }} />
          </View>
        </View>

        {/* Portfolio value chart */}
        <View style={styles.card}>
          <View style={styles.value_head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.value_title}>Portfolio value</Text>
              <Text style={styles.value_sub}>Total value (cash + positions) since open</Text>
            </View>
            <Text style={[styles.value_pct, { color: color_for_sign(period_return) }]}>{fmt_signed_pct(period_return, 1)}</Text>
          </View>
          {perf.length > 0 ? <PerformanceChart data={perf} height={200} format_value={p => fmt_eur_m(p.v)} /> : <Text style={styles.chart_empty}>No history yet</Text>}
        </View>

        {/* Positions / Trades — kept in the main flow, right under the chart */}
        <View style={styles.card}>
          <View style={styles.tabbar}>
            {([
              { k: "positions" as PositionsTab, label: "Positions", count: holdings.length },
              { k: "trades" as PositionsTab, label: "Trade history", count: trades.length },
            ]).map(t => {
              const on = positions_tab === t.k;
              return (
                <Pressable key={t.k} onPress={() => set_positions_tab(t.k)} style={[styles.tabbtn, on && styles.tabbtn_on]}>
                  <Text style={[styles.tabbtn_label, on && styles.tabbtn_label_on]}>
                    {t.label} <Text style={styles.tabbtn_count}>{t.count}</Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {positions_tab === "positions" ? (
            holdings.length === 0 ? (
              <Text style={styles.list_empty}>No open positions.</Text>
            ) : (
              sorted_holdings.map(h => (
                <PositionRow key={h.player_id} h={h} opened={fmt_short_date(opened_by_player.get(h.player_id))} on_open={() => sheet_ref.current?.open(h.player)} />
              ))
            )
          ) : trades.length === 0 ? (
            <Text style={styles.list_empty}>No trades yet.</Text>
          ) : (
            sorted_trades.map(t => <TradeRow key={t.id} trade={t} />)
          )}
        </View>

        {/* Analytics — one chart at a time via tabs (no long stack/scroll) */}
        <Text style={styles.analytics_label}>Analytics</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.atab_row}>
          {ANALYTICS_TABS.map(t => {
            const on = analytics_tab === t.k;
            return (
              <Pressable key={t.k} onPress={() => set_analytics_tab(t.k)} style={[styles.atab, on && styles.atab_on]}>
                <Text style={[styles.atab_label, on && styles.atab_label_on]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {analytics_tab === "exposure" && <ExposureCard total_value={total_value} />}
        {analytics_tab === "winloss" && <WinLossCard holdings={holdings} />}
        {analytics_tab === "team" && <BreakdownCard title="By team" items={with_color(by_team)} chart="bars" />}
        {analytics_tab === "position" && <BreakdownCard title="By position" items={with_color(by_position)} chart="pie" />}
        {analytics_tab === "age" && <BreakdownCard title="By age" items={with_color(by_age)} chart="pie" />}
      </ScrollView>
      <PlayerSheet ref={sheet_ref} />
    </View>
  );
}

function PlayerAvatar({ player, size }: { player: Player; size: number }) {
  const team = teams_api.get(player.team_id);
  if (player.image_path) {
    return <Image source={{ uri: player.image_path }} style={[styles.avatar, { width: size, height: size }]} resizeMode="contain" />;
  }
  return <PlayerChip jersey_number={player.jersey_number} team_color={team?.color ?? "#666"} size={size} />;
}

function PositionRow({ h, opened, on_open }: { h: HoldingDetail; opened: string; on_open: () => void }) {
  const team = teams_api.get(h.player.team_id);
  const is_long = h.shares > 0;
  return (
    <Pressable style={styles.row} onPress={on_open} accessibilityRole="button">
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
        <View style={styles.row_pnl}>
          <Text style={[styles.row_pnl_value, { color: color_for_sign(h.pnl) }]}>{fmt_eur_m_signed(h.pnl)}</Text>
          <Text style={[styles.row_pnl_pct, { color: color_for_sign(h.return_pct) }]}>{fmt_signed_pct(h.return_pct, 1)}</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        <StripCell label="Opened" value={opened} />
        <StripCell label="Shares" value={fmt_shares(h.shares)} />
        <StripCell label="Avg buy" value={`€${h.average_buy_price}M`} />
        <StripCell label="Price" value={fmt_eur_m(h.current_price)} pulse={h.current_price} />
        <StripCell label="Value" value={fmt_eur_m(h.market_value)} pulse={h.market_value} />
      </ScrollView>
    </Pressable>
  );
}

function StripCell({ label, value, pulse }: { label: string; value: string; pulse?: number }) {
  return (
    <View style={styles.strip_cell}>
      <Text style={styles.strip_label}>{label}</Text>
      {pulse !== undefined ? (
        <TickValue value={pulse}>
          <Text style={styles.strip_value}>{value}</Text>
        </TickValue>
      ) : (
        <Text style={styles.strip_value}>{value}</Text>
      )}
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
          <Text style={styles.trade_date}>{t.date}</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        <StripCell label="Shares" value={fmt_shares(t.shares)} />
        <StripCell label="Price" value={`€${t.price}M`} />
        <StripCell label="Total" value={fmt_eur_m(t.total)} />
      </ScrollView>
    </View>
  );
}

function ExposureCard({ total_value }: { total_value: number }) {
  const long_value = total_value;
  const short_value = 0;
  const total = long_value + short_value || 1;
  const long_pct = (long_value / total) * 100;
  const short_pct = (short_value / total) * 100;
  const net = long_value - short_value;
  return (
    <Section title="Position Long / Short">
      <View style={styles.bar}>
        {long_pct > 0 && (
          <View style={[styles.bar_seg, { flex: long_pct, backgroundColor: "rgba(0,128,93,0.4)" }]}>
            <Text style={styles.bar_label}>{long_pct.toFixed(0)}%</Text>
          </View>
        )}
        {short_pct > 0 && (
          <View style={[styles.bar_seg, { flex: short_pct, backgroundColor: "rgba(228,21,65,0.4)" }]}>
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
          <View style={[styles.bar_seg, { flex: winners / total, backgroundColor: "rgba(0,128,93,0.4)" }]}>
            <Text style={styles.bar_label}>{((winners / total) * 100).toFixed(0)}%</Text>
          </View>
        )}
        {flat > 0 && (
          <View style={[styles.bar_seg, { flex: flat / total, backgroundColor: "rgba(255,255,255,0.06)" }]}>
            <Text style={[styles.bar_label, { color: text.secondary }]}>{((flat / total) * 100).toFixed(0)}%</Text>
          </View>
        )}
        {losers > 0 && (
          <View style={[styles.bar_seg, { flex: losers / total, backgroundColor: "rgba(228,21,65,0.4)" }]}>
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
  pct: string;
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
                <Text style={styles.legend_pct}>{parseFloat(it.pct) >= 0 ? "+" : ""}{it.pct}%</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {items.map((it, i) => {
            const pct = parseFloat(it.pct);
            const neg = pct < 0;
            return (
              <View key={i} style={{ gap: 4 }}>
                <View style={styles.bars_head}>
                  <Text style={styles.legend_label} numberOfLines={1}>{it.label}</Text>
                  <Text style={[styles.legend_pct, neg && { color: palette.negative }]}>{pct >= 0 ? "+" : ""}{it.pct}%</Text>
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

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpi_label} numberOfLines={1}>{label}</Text>
      <Text style={[styles.kpi_value, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{value}</Text>
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

  analytics_label: { fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", color: text.secondary, marginTop: 4 },
  atab_row: { gap: 8, paddingVertical: 2 },
  atab: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  atab_on: { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.22)" },
  atab_label: { color: text.secondary, fontSize: 13, fontWeight: "700" },
  atab_label_on: { color: "#fff" },
  kpi_grid: { gap: 8 },
  kpi_row: { flexDirection: "row", gap: 8 },
  kpi: { flex: 1, backgroundColor: "rgba(255,255,255,0.025)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 8 },
  kpi_label: { fontSize: 9, color: text.tertiary, letterSpacing: 0.3, textTransform: "uppercase", fontWeight: "600" },
  kpi_value: { fontFamily: mono, fontSize: 15, fontWeight: "800", color: "#fff", marginTop: 3 },

  card: { backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.04)", borderRadius: 12, overflow: "hidden" },
  value_head: { flexDirection: "row", alignItems: "center", padding: 16, paddingBottom: 8 },
  value_title: { fontSize: 14, fontWeight: "800", color: "#fff" },
  value_sub: { fontSize: 11, color: text.tertiary, marginTop: 2 },
  value_pct: { fontFamily: mono, fontSize: 18, fontWeight: "800" },
  chart_empty: { color: text.tertiary, fontSize: 12, textAlign: "center", paddingVertical: 40 },

  tabbar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  tabbtn: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabbtn_on: { borderBottomColor: "#fff" },
  tabbtn_label: { fontSize: 13, fontWeight: "500", color: text.tertiary },
  tabbtn_label_on: { color: "#fff", fontWeight: "800" },
  tabbtn_count: { fontSize: 11, color: text.muted, fontWeight: "600" },
  list_empty: { padding: 24, textAlign: "center", color: text.muted, fontSize: 13 },

  row: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.025)" },
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
  row_pnl_value: { fontFamily: mono, fontSize: 13, fontWeight: "700" },
  row_pnl_pct: { fontFamily: mono, fontSize: 11, marginTop: 1 },
  trade_total: { fontFamily: mono, fontSize: 13, fontWeight: "700", color: "#fff" },
  trade_date: { fontSize: 11, color: text.tertiary, marginTop: 1 },

  strip: { flexDirection: "row", gap: 14, paddingLeft: 46, alignItems: "center" },
  strip_cell: { minWidth: 44 },
  strip_label: { fontSize: 8, fontWeight: "700", color: text.muted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 2 },
  strip_value: { fontFamily: mono, fontSize: 12, fontWeight: "700", color: "#fff" },

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
