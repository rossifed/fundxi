import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { players_api } from "@fundxi/core/api/players_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { POSITION_ABBR } from "@fundxi/core/domain/player/player";
import type { Player } from "@fundxi/core/domain/player/player";
import { compute_portfolio_breakdowns } from "@fundxi/core/domain/portfolio/portfolio_breakdown";
import type { HoldingMetrics } from "@fundxi/core/domain/portfolio/portfolio_metrics";
import type { HoldingDetail } from "@fundxi/core/application/portfolio_service";
import type { Trade } from "@fundxi/core/domain/portfolio/trade";
import { chart_category_ramp } from "@fundxi/core/design/palette";
import { ClosePositionsDialog } from "@/ui/components/ClosePositionsDialog";
import { PlayerAvatar as PlayerAvatarBase } from "@/ui/components/PlayerAvatar";
import { PerformanceChart } from "@/ui/components/PerformanceChart";
import { Donut } from "@/ui/components/Donut";
import { SortableHeader, type SortDir } from "@/ui/components/SortableHeader";
import { TeamLink } from "@/ui/components/TeamLink";
import { color_for_sign, fmt_eur_from_m, fmt_eur_m, fmt_eur_m_signed, fmt_shares, fmt_signed_pct } from "@/ui/helpers/format";
import { position_color } from "@/ui/design/tokens";

function fmt_short_date(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
import { useLiveValuations } from "@/ui/hooks/use_live_valuations";
import { pulse_class, usePulse } from "@/ui/hooks/use_pulse";
import { useViewport } from "@/ui/hooks/use_viewport";

// Desktop uses only positions/trades (two tabs beside the breakdown rail). The
// phone layout adds Stats + Allocation, folding the rail into tabs like native.
type PositionsTab = "positions" | "trades" | "stats" | "allocation";
type AllocTab = "team" | "role" | "age";

type SortState = { key: string; dir: SortDir };
type HoldingRow = HoldingMetrics & { player: Player };

/** Toggle the sort: same column flips direction, a new column starts
 * descending (the most useful default for money / counts). */
function next_sort(prev: SortState, key: string): SortState {
  if (prev.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
  return { key, dir: "desc" };
}

/** Stable, in-place-free sort. Strings compare with ``localeCompare``,
 * numbers numerically; ``dir`` flips the sign. */
function sort_rows<T>(rows: T[], spec: SortState, value_of: (row: T, key: string) => string | number): T[] {
  const sign = spec.dir === "asc" ? 1 : -1;
  return rows.sort((a, b) => {
    const va = value_of(a, spec.key);
    const vb = value_of(b, spec.key);
    if (typeof va === "string" && typeof vb === "string") return sign * va.localeCompare(vb);
    return sign * (Number(va) - Number(vb));
  });
}

function holding_sort_value(h: HoldingRow, key: string, opened: Map<number, string>): string | number {
  switch (key) {
    case "player": return h.player.name;
    case "opened": return opened.get(h.player_id) ?? "";
    case "shares": return h.shares;
    case "avg_buy": return h.average_buy_price;
    case "price": return h.current_price;
    case "value": return h.market_value;
    case "pnl": return h.pnl;
    default: return 0;
  }
}

function trade_sort_value(t: Trade, key: string): string | number {
  switch (key) {
    case "player": return t.player_name;
    case "type": return t.kind;
    case "shares": return t.shares;
    case "price": return t.price;
    case "total": return t.total;
    case "date": return t.date;
    default: return 0;
  }
}

// Shared column template for the positions table header + rows so the
// two grids cannot drift. A leading fixed 34px checkbox track, then 8
// ``minmax(0, <n>fr)`` proportional tracks — the fr tracks absorb the
// remainder so the grid is ALWAYS exactly the container width: it never
// overflows (no horizontal scroll) and never clips. Columns just get
// tighter on a narrow container; the Player cell ellipsises.
// Checkbox + 7 columns: Player, Opened, Shares, Avg buy, Price, Value, P&L.
// (No "Side" column — the app is long-only, every position is a long, so a
// long/short label carries no information. Position is shown as an acronym
// inside the Player cell, not as a dedicated column.)
const POSITIONS_GRID =
  "34px minmax(0,2.4fr) minmax(0,0.95fr) minmax(0,0.7fr) " +
  "minmax(0,0.95fr) minmax(0,0.95fr) minmax(0,0.95fr) minmax(0,1.15fr)";

// Minimum widths the positions / trades tables hold on a phone, where they
// scroll horizontally inside their panel instead of crushing every column.
const POSITIONS_MIN_W = 720;
const TRADES_MIN_W = 560;

// Allocation breakdown ramp — shared brand-blue categorical token
// (packages/core/src/design/palette.ts), aligned with the logo's blue.
const CHART_PALETTE = chart_category_ramp;

/** Style for a Positions bulk-action bar button. ``ghost`` = the
 * lower-emphasis outline variant (used for the destructive "Close
 * all"); the filled variant carries the sell accent. */
function bar_button_style(disabled: boolean, ghost: boolean): CSSProperties {
  return {
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 8,
    fontFamily: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? "rgba(255,255,255,.04)" : ghost ? "transparent" : "var(--color-action-sell)",
    color: disabled ? "rgba(255,255,255,.25)" : ghost ? "rgba(255,255,255,.7)" : "#fff",
    border: ghost ? "1px solid rgba(255,255,255,.12)" : "1px solid transparent",
  };
}

interface PortfolioPageProps {
  on_open_player: (player: Player) => void;
  on_open_team?: (team_id: string) => void;
}

export function PortfolioPage({ on_open_player, on_open_team }: PortfolioPageProps) {
  const { is_mobile } = useViewport();
  // Live data feeds one ``data_version`` counter that every memo below
  // depends on. It is bumped by:
  //  - the shared live-valuations stream (one SSE + one debounced
  //    refetch per browser — see use_live_valuations) on a price tick;
  //  - a trade (in-place portfolio mutation) via portfolio_api.subscribe;
  //  - the one-shot holdings hydration on mount.
  const live_valuations = useLiveValuations();
  const [data_version, set_data_version] = useState(0);
  useEffect(() => set_data_version(v => v + 1), [live_valuations]);
  useEffect(() => portfolio_api.subscribe(() => set_data_version(v => v + 1)), []);
  // Hydrate holdings + cash once on mount (valuations are hydrated by
  // the shared live stream; holdings only change on a trade).
  useEffect(() => {
    void portfolio_api.refresh().then(() => set_data_version(v => v + 1));
  }, []);

  const holdings = useMemo(() => portfolio_api.get_holdings(), [data_version]);
  const trades = useMemo(() => portfolio_api.list_trades(), [data_version]);
  const totals = useMemo(() => portfolio_api.get_totals(), [data_version]);
  const total_value = totals.total_value;
  // Allocation slices (by team / position / age) + win-rate: single source
  // shared with mobile (packages/core domain). The UI only maps these to
  // display items below — no calculation leaks here. See COHERENCE-INVARIANT.
  const breakdowns = useMemo(
    () => compute_portfolio_breakdowns(holdings, id => teams_api.get(id)),
    [holdings],
  );
  const win_rate = breakdowns.win_rate;

  const [positions_tab, set_positions_tab] = useState<PositionsTab>("positions");
  const [alloc_tab, set_alloc_tab] = useState<AllocTab>("team");

  // Real portfolio curve: served by the backend
  // (``GET /api/portfolio/history``). All math + storage are server-side
  // (hypertable ``valuation.portfolio_value_snapshot``). Web + mobile +
  // any future surface read from the same DTO. We re-fetch on every
  // price-tick wave so the chart stays in sync with the KPIs above.
  const [performance_data, set_performance_data] = useState<{ v: number; label?: string; pnl?: number; ts?: number }[]>([]);
  useEffect(() => {
    let cancelled = false;
    void portfolio_api.fetch_history("all").then(dto => {
      if (cancelled) return;
      set_performance_data(
        dto.points.map(p => {
          const dt = new Date(p.ts);
          const label = `${dt.toLocaleDateString(undefined, { day: "2-digit", month: "short" })} · ${dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
          return { v: p.value, label, pnl: p.pnl_vs_open, ts: dt.getTime() };
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [data_version]);
  // Perf since the portfolio opened — the SINGLE truth shown everywhere: the
  // live total value vs the opening value (first history snapshot = starting
  // capital). Realized + unrealized (cash already holds realized P&L), and it
  // moves with prices. Anchored to the SAME opening as the chart, so the Total-
  // value card, the chart and the KPIs reconcile by construction. (null until
  // the history loads.)
  // open_value = value − pnl_vs_open at any point (the server anchors pnl_vs_open
  // to the all-time open, never the window), so this is the true starting capital.
  const inception_value =
    performance_data.length > 0 ? performance_data[0]!.v - (performance_data[0]!.pnl ?? 0) : null;
  const pnl_since_inception = inception_value != null ? total_value - inception_value : null;
  const pnl_since_inception_pct =
    inception_value != null && inception_value !== 0
      ? ((total_value - inception_value) / inception_value) * 100
      : null;
  const inception_delta =
    pnl_since_inception != null && pnl_since_inception_pct != null
      ? `${fmt_eur_m_signed(pnl_since_inception)} (${fmt_signed_pct(pnl_since_inception_pct, 1)})`
      : "—";

  // Earliest trade per player → opening date of the current position.
  // For longs that's the first buy; for shorts the first sell. We just
  // take the earliest of any kind matching this player_id.
  const opened_by_player = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of trades) {
      const cur = map.get(t.player_id);
      if (!cur || t.date < cur) map.set(t.player_id, t.date);
    }
    return map;
  }, [trades]);

  // Click-to-sort state for the two tables. Positions default to value
  // desc (biggest holding first); trades to date desc (newest first) —
  // the behaviour from before the headers became sortable.
  const [pos_sort, set_pos_sort] = useState<SortState>({ key: "value", dir: "desc" });
  const [trade_sort, set_trade_sort] = useState<SortState>({ key: "date", dir: "desc" });

  const sorted_holdings = useMemo(
    () => sort_rows([...holdings], pos_sort, (h, k) => holding_sort_value(h, k, opened_by_player)),
    [holdings, pos_sort, opened_by_player],
  );
  const sorted_trades = useMemo(
    () => sort_rows([...trades], trade_sort, trade_sort_value),
    [trades, trade_sort],
  );

  // --- Position selection / batch close -----------------------------
  // ``selected`` holds the player_ids ticked in the Positions table.
  // ``close_targets`` is the snapshot handed to the close dialog
  // (null = dialog closed).
  const [selected, set_selected] = useState<Set<number>>(new Set());
  const [close_targets, set_close_targets] = useState<HoldingRow[] | null>(null);

  const some_selected = selected.size > 0;
  const all_selected = holdings.length > 0 && selected.size === holdings.length;

  const toggle_one = (player_id: number) =>
    set_selected(prev => {
      const next = new Set(prev);
      if (next.has(player_id)) next.delete(player_id);
      else next.add(player_id);
      return next;
    });
  const toggle_all = () =>
    set_selected(all_selected ? new Set() : new Set(holdings.map(h => h.player_id)));
  const close_selected = () => set_close_targets(holdings.filter(h => selected.has(h.player_id)));
  const close_all = () => set_close_targets([...holdings]);
  // On dismiss, drop ids whose position no longer exists (just closed)
  // and keep the rest — so cancelling preserves the user's selection.
  const dismiss_close_dialog = () => {
    set_close_targets(null);
    set_selected(prev => new Set([...prev].filter(id => holdings.some(h => h.player_id === id))));
  };

  const team_items = breakdowns.by_team.map((t, i) => ({
    label: `${t.flag} ${t.name}`,
    color: CHART_PALETTE[i] ?? CHART_PALETTE.at(-1)!,
    pct: t.pct,
    v: t.value,
    team_id: t.key,
  }));
  const position_items = breakdowns.by_position.map((p, i) => ({
    label: p.label,
    color: CHART_PALETTE[i] ?? CHART_PALETTE.at(-1)!,
    pct: p.pct,
    v: p.value,
  }));
  const age_items = breakdowns.by_age.map((a, i) => ({
    label: a.label,
    color: CHART_PALETTE[i] ?? CHART_PALETTE.at(-1)!,
    pct: a.pct,
    v: a.value,
  }));

  // ── Phone: native-style single-column flow (hero -> chart -> KPI grid ->
  // Positions/Trades/Stats/Allocation tabs). Mirrors apps/mobile portfolio. ──
  if (is_mobile) {
    const top_position_pnl = holdings.length > 0 ? Math.max(...holdings.map(h => h.pnl)) : null;
    const tabs: { k: PositionsTab; label: string; count?: number }[] = [
      { k: "positions", label: "Positions", count: holdings.length },
      { k: "trades", label: "Trades", count: trades.length },
      { k: "stats", label: "Stats" },
      { k: "allocation", label: "Allocation" },
    ];
    const alloc_tabs: { k: AllocTab; label: string }[] = [
      { k: "team", label: "By team" },
      { k: "role", label: "By role" },
      { k: "age", label: "By age" },
    ];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Hero — Total value + Buying power */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <HeroCard label="Total value" value={fmt_eur_m(total_value)} delta={inception_delta} delta_color={color_for_sign(pnl_since_inception)} note="Since inception" />
          <HeroCard label="Buying power" value={fmt_eur_m(totals.buying_power)} delta={`${fmt_eur_m(totals.cash)} cash`} delta_color="rgba(255,255,255,.5)" note="Deployable now" />
        </div>

        {/* Portfolio value chart — the perf % now lives in the Total value card
            above (single source); the title alone here avoids a redundant %. */}
        <div style={mobile_card_style}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Portfolio value</div>
          </div>
          {performance_data.length > 0 ? (
            <PerformanceChart data={performance_data} height={176} format_axis={v => `€${v.toFixed(1)}M`} min_span_pct={5} show_axes show_last_value />
          ) : (
            <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,.3)", fontSize: 12 }}>No history yet</div>
          )}
        </div>

        {/* Secondary KPI grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <KpiCard label="Invested" value={fmt_eur_m(totals.gross_cost)} />
          <KpiCard label="Positions" value={String(holdings.length)} />
          <KpiCard label="Trades" value={String(trades.length)} />
          <KpiCard label="Win rate" value={win_rate == null ? "—" : `${win_rate.toFixed(0)}%`} />
          <KpiCard
            label="Top position"
            value={top_position_pnl == null ? "—" : fmt_eur_m_signed(top_position_pnl)}
            color={top_position_pnl == null ? undefined : color_for_sign(top_position_pnl)}
          />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,.03)", borderRadius: 10, padding: 3 }}>
          {tabs.map(t => {
            const on = positions_tab === t.k;
            return (
              <button
                key={t.k}
                onClick={() => set_positions_tab(t.k)}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  borderRadius: 7,
                  border: "none",
                  background: on ? "rgba(255,255,255,.08)" : "transparent",
                  color: on ? "#fff" : "rgba(255,255,255,.4)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                {t.label}
                {t.count !== undefined && (
                  <span style={{ color: on ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.3)", fontWeight: 600 }}> {t.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Allocation sub-tabs */}
        {positions_tab === "allocation" && (
          <div style={{ display: "flex", gap: 6 }}>
            {alloc_tabs.map(t => {
              const on = alloc_tab === t.k;
              return (
                <button
                  key={t.k}
                  onClick={() => set_alloc_tab(t.k)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid " + (on ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.06)"),
                    background: on ? "rgba(255,255,255,.08)" : "transparent",
                    color: on ? "#fff" : "rgba(255,255,255,.45)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Tab content */}
        {positions_tab === "positions" ? (
          holdings.length === 0 ? (
            <MobileEmpty>No open positions.</MobileEmpty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Per-position selection (parity with the desktop table): tick the
                  positions to close, or close all. Same selection state + close
                  use case as desktop — no duplicated logic. */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <button
                  onClick={toggle_all}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.1)", background: "transparent", color: "rgba(255,255,255,.6)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {all_selected ? "Clear" : "Select all"}
                </button>
                <button
                  onClick={some_selected ? close_selected : close_all}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid color-mix(in srgb, var(--color-negative) 30%, transparent)", background: "color-mix(in srgb, var(--color-negative) 8%, transparent)", color: "var(--color-negative)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {some_selected ? `Close selected (${selected.size})` : "Close all"}
                </button>
              </div>
              {sorted_holdings.map(h => (
                <MobilePositionCard
                  key={h.player_id}
                  h={h}
                  opened={opened_by_player.get(h.player_id)}
                  selected={selected.has(h.player_id)}
                  on_toggle={() => toggle_one(h.player_id)}
                  on_open={() => on_open_player(h.player)}
                  on_open_team={on_open_team}
                />
              ))}
            </div>
          )
        ) : positions_tab === "trades" ? (
          trades.length === 0 ? (
            <MobileEmpty>No trades yet.</MobileEmpty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sorted_trades.map(t => (
                <MobileTradeCard key={t.id} t={t} on_open_team={on_open_team} />
              ))}
            </div>
          )
        ) : positions_tab === "stats" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <WinLossCard holdings={holdings} />
          </div>
        ) : (
          <>
            {alloc_tab === "team" && <BreakdownCard title="By team" items={team_items} chart="bars" on_open_team={on_open_team} />}
            {alloc_tab === "role" && <BreakdownCard title="By position" items={position_items} chart="pie" />}
            {alloc_tab === "age" && <BreakdownCard title="By age" items={age_items} chart="pie" />}
          </>
        )}

        {close_targets && <ClosePositionsDialog open={true} positions={close_targets} on_close={dismiss_close_dialog} />}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPI row — 8 across on desktop, 2 across on a phone (4 rows). */}
      <div style={{ display: "grid", gridTemplateColumns: is_mobile ? "repeat(2, 1fr)" : "repeat(8, 1fr)", gap: is_mobile ? 8 : 12 }}>
        <KpiCard
          label="Total Value"
          value={fmt_eur_m(total_value)}
          title="Everything you own right now: free cash + market value of every position"
        />
        <KpiCard label="Cash" value={fmt_eur_m(totals.cash)} title="Free cash available to trade" />
        <KpiCard
          label="Invested"
          value={fmt_eur_m(totals.gross_cost)}
          title="Capital deployed across all positions (sum of |avg buy x shares|). A long and an offsetting short both count — they do NOT cancel."
        />
        <KpiCard label="Positions" value={String(holdings.length)} title="Number of open positions" />
        <KpiCard
          label="P&L"
          value={pnl_since_inception != null ? fmt_eur_m_signed(pnl_since_inception) : "—"}
          color={color_for_sign(pnl_since_inception)}
          title="Profit / loss since you opened the portfolio (realized + unrealized) — total value minus your starting capital. The single number shown in the Total value card and the chart."
        />
        <KpiCard
          label="Return"
          value={pnl_since_inception_pct != null ? fmt_signed_pct(pnl_since_inception_pct, 1) : "—"}
          color={color_for_sign(pnl_since_inception_pct)}
          title="P&L since inception as a percentage of your starting capital. Same anchor as the Portfolio value chart, so they always agree."
        />
        <KpiCard label="Trades" value={String(trades.length)} title="Total number of trades executed" />
        <KpiCard
          label="Win rate"
          value={win_rate == null ? "—" : `${win_rate.toFixed(0)}%`}
          title="Share of open positions currently in profit (winners / positions)."
        />
      </div>

      {/* 2-col layout: stats + perf + positions on the left, breakdowns
          stack on the right. The right rail starts at the very top of
          this grid (same Y as Long/Short on the left). */}
      <div
        style={{
          display: "grid",
          // Single column on a phone: the breakdown rail stacks below the
          // positions panel instead of sitting beside it.
          gridTemplateColumns: is_mobile ? "1fr" : "minmax(0, 1fr) 340px",
          columnGap: 16,
          rowGap: 16,
          alignItems: "stretch",
        }}
      >
        {/* Left col — Perf chart → Positions/Trades (stretches to match
            the right rail height so the bottoms align). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div
            style={{
              background: "rgba(255,255,255,.02)",
              border: "1px solid rgba(255,255,255,.04)",
              borderRadius: 12,
              padding: "16px 20px",
              minWidth: 0,
            }}
          >
            {/* Perf % moved to the Total value / P&L+Return KPIs (single source);
                the chart keeps just its title to avoid a redundant figure. */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Portfolio value</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 2 }}>
                Total value (cash + positions) since portfolio open
              </div>
            </div>
            <PerformanceChart
              data={performance_data}
              height={280}
              format_axis={v => `€${v.toFixed(1)}M`}
              min_span_pct={5}
              show_axes
              show_last_value
            />
          </div>

          {/* Positions / Trade history — flex-grows to fill remaining
              left-col height so the bottom aligns with the right rail. */}
          <div
            style={{
              background: "rgba(255,255,255,.02)",
              border: "1px solid rgba(255,255,255,.04)",
              borderRadius: 12,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
            }}
          >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,.05)",
          }}
        >
          <div style={{ display: "flex" }}>
            {(
              [
                { k: "positions" as PositionsTab, label: "Positions", count: holdings.length },
                { k: "trades" as PositionsTab, label: "Trade history", count: trades.length },
              ]
            ).map(t => (
              <button
                key={t.k}
                onClick={() => set_positions_tab(t.k)}
                style={{
                  padding: "14px 22px",
                  fontSize: 13,
                  fontWeight: positions_tab === t.k ? 800 : 500,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background: "transparent",
                  color: positions_tab === t.k ? "#fff" : "rgba(255,255,255,.35)",
                  borderBottom: positions_tab === t.k ? "2px solid #fff" : "2px solid transparent",
                  letterSpacing: 0.2,
                }}
              >
                {t.label}{" "}
                <span style={{ fontSize: 11, color: "rgba(255,255,255,.3)", fontWeight: 600 }}>{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {positions_tab === "positions" ? (
          <>
            {holdings.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 18px",
                  borderBottom: "1px solid rgba(255,255,255,.05)",
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 12, color: "rgba(255,255,255,.45)" }}>
                  {some_selected ? `${selected.size} selected` : "Select positions to close"}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={close_selected}
                    disabled={!some_selected}
                    style={bar_button_style(!some_selected, false)}
                  >
                    Close selected
                  </button>
                  <button type="button" onClick={close_all} style={bar_button_style(false, true)}>
                    Close all
                  </button>
                </div>
              </div>
            )}
            {/* On a phone the 8-column table scrolls horizontally so each
                column keeps a readable width (display:contents = desktop
                unchanged). */}
            <div style={is_mobile ? { overflowX: "auto" } : { display: "contents" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: POSITIONS_GRID,
                minWidth: is_mobile ? POSITIONS_MIN_W : undefined,
                padding: "10px 18px",
                borderBottom: "1px solid rgba(255,255,255,.04)",
                fontSize: 10,
                fontWeight: 700,
                color: "rgba(255,255,255,.35)",
                letterSpacing: 0.5,
                textTransform: "uppercase",
                gap: 12,
              }}
            >
              <input
                type="checkbox"
                checked={all_selected}
                ref={el => {
                  if (el) el.indeterminate = some_selected && !all_selected;
                }}
                onChange={toggle_all}
                aria-label="Select all positions"
                style={{ cursor: "pointer", accentColor: "var(--color-positive)", alignSelf: "center" }}
              />
              {(
                [
                  { key: "player", label: "Player", align: "left" },
                  { key: "opened", label: "Opened", align: "left" },
                  { key: "shares", label: "Shares", align: "right" },
                  { key: "avg_buy", label: "Avg /sh", align: "right" },
                  { key: "price", label: "Price /sh", align: "right" },
                  { key: "value", label: "Value", align: "right" },
                  { key: "pnl", label: "P&L", align: "right" },
                ] as const
              ).map(c => (
                <SortableHeader
                  key={c.key}
                  label={c.label}
                  sort_key={c.key}
                  active_key={pos_sort.key}
                  dir={pos_sort.dir}
                  on_sort={k => set_pos_sort(prev => next_sort(prev, k))}
                  align={c.align}
                />
              ))}
            </div>
            <div
              className="scroll-visible"
              style={{
                flex: is_mobile ? "none" : 1,
                minHeight: is_mobile ? undefined : 0,
                minWidth: is_mobile ? POSITIONS_MIN_W : undefined,
                overflowY: is_mobile ? "visible" : "auto",
              }}
            >
            {sorted_holdings.map(h => {
              const team = teams_api.get(h.player.team_id);
              return (
                <div
                  key={h.player_id}
                  onClick={() => on_open_player(h.player)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: POSITIONS_GRID,
                    padding: "11px 18px",
                    borderBottom: "1px solid rgba(255,255,255,.025)",
                    cursor: "pointer",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 13,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.025)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span
                    onClick={e => e.stopPropagation()}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(h.player_id)}
                      onChange={() => toggle_one(h.player_id)}
                      aria-label={`Select ${h.player.name}`}
                      style={{ cursor: "pointer", accentColor: "var(--color-positive)" }}
                    />
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <PlayerAvatar player={h.player} team_color={team?.color ?? "#666"} size={36} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.45)", flexShrink: 0 }}>
                          {h.player.jersey_number}
                        </span>
                        <span style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                          {h.player.name}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)", display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                        <TeamLink
                          team_id={h.player.team_id}
                          on_open_team={on_open_team}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0 }}
                        >
                          <span style={{ flexShrink: 0 }}>{team?.flag}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                            {team?.name}
                          </span>
                        </TeamLink>
                        <span style={{ color: position_color[h.player.position], fontWeight: 700, flexShrink: 0 }}>
                          · {POSITION_ABBR[h.player.position]}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="mono" style={{ fontSize: 12, color: "rgba(255,255,255,.55)" }}>
                    {fmt_short_date(opened_by_player.get(h.player_id))}
                  </span>
                  <span className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{fmt_shares(h.display_shares)}</span>
                  <span className="mono" style={{ textAlign: "right", color: "rgba(255,255,255,.55)" }}>
                    {fmt_eur_from_m(h.avg_buy_per_share)}
                  </span>
                  <div
                    className="mono"
                    style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.2 }}
                  >
                    <PulseValueCell value={h.price_per_share} display={fmt_eur_from_m(h.price_per_share)} />
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }} title="Player market cap (whole value)">
                      {fmt_eur_m(h.current_price)} cap
                    </span>
                  </div>
                  <div
                    className="mono"
                    style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.2 }}
                  >
                    <PulseValueCell value={h.market_value} display={fmt_eur_m(h.market_value)} />
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }} title="Share of total portfolio value">
                      {h.portfolio_pct.toFixed(1)}%
                    </span>
                  </div>
                  <div
                    className="mono"
                    style={{
                      textAlign: "right",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      lineHeight: 1.2,
                      color: color_for_sign(h.pnl),
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{fmt_eur_m_signed(h.pnl)}</span>
                    <span style={{ fontSize: 11, opacity: 0.75 }}>{fmt_signed_pct(h.return_pct, 1)}</span>
                  </div>
                </div>
              );
            })}
            </div>
            </div>
          </>
        ) : (
          <>
            <div style={is_mobile ? { overflowX: "auto" } : { display: "contents" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 52px 74px 76px 92px 90px",
                minWidth: is_mobile ? TRADES_MIN_W : undefined,
                padding: "10px 14px",
                borderBottom: "1px solid rgba(255,255,255,.04)",
                fontSize: 10,
                fontWeight: 700,
                color: "rgba(255,255,255,.35)",
                letterSpacing: 0.5,
                textTransform: "uppercase",
                gap: 12,
              }}
            >
              {(
                [
                  { key: "player", label: "Player", align: "left" },
                  { key: "type", label: "Type", align: "left" },
                  { key: "shares", label: "Shares", align: "right" },
                  { key: "price", label: "Price /sh", align: "right" },
                  { key: "total", label: "Total", align: "right" },
                  { key: "date", label: "Date", align: "right" },
                ] as const
              ).map(c => (
                <SortableHeader
                  key={c.key}
                  label={c.label}
                  sort_key={c.key}
                  active_key={trade_sort.key}
                  dir={trade_sort.dir}
                  on_sort={k => set_trade_sort(prev => next_sort(prev, k))}
                  align={c.align}
                />
              ))}
            </div>
            <div
              className="scroll-visible"
              style={{
                flex: is_mobile ? "none" : 1,
                minHeight: is_mobile ? undefined : 0,
                minWidth: is_mobile ? TRADES_MIN_W : undefined,
                overflowY: is_mobile ? "visible" : "auto",
              }}
            >
            {sorted_trades.map(t => {
                const team = teams_api.get(t.team_id);
                const player = players_api.get(t.player_id);
                const is_buy = t.kind === "buy";
                return (
                  <div
                    key={t.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) 52px 74px 76px 92px 90px",
                      padding: "11px 14px",
                      borderBottom: "1px solid rgba(255,255,255,.025)",
                      alignItems: "center",
                      gap: 12,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      {player && (
                        <PlayerAvatar player={player} team_color={team?.color ?? "#666"} size={32} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          {player && (
                            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.45)", flexShrink: 0 }}>
                              {player.jersey_number}
                            </span>
                          )}
                          <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                            {t.player_name}
                          </span>
                        </div>
                        <TeamLink
                          team_id={t.team_id}
                          on_open_team={on_open_team}
                          style={{ fontSize: 11, color: "rgba(255,255,255,.3)", display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          <span>{team?.flag}</span>
                          <span>{team?.name}</span>
                        </TeamLink>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "3px 8px",
                        borderRadius: 4,
                        background: is_buy ? "var(--color-action-buy)" : "var(--color-action-sell)",
                        color: "#fff",
                        textAlign: "center",
                        letterSpacing: 0.5,
                        width: "fit-content",
                      }}
                    >
                      {t.kind.toUpperCase()}
                    </span>
                    <span className="mono" style={{ textAlign: "right" }}>{fmt_shares(portfolio_api.to_display_shares(t.shares))}</span>
                    <span className="mono" style={{ textAlign: "right", color: "rgba(255,255,255,.55)" }}>
                      {fmt_eur_from_m(portfolio_api.to_price_per_share(t.price))}
                    </span>
                    <span className="mono" style={{ textAlign: "right", fontWeight: 700 }}>
                      {fmt_eur_m(t.total)}
                    </span>
                    <div
                      className="mono"
                      style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.2 }}
                    >
                      <span style={{ color: "rgba(255,255,255,.55)", fontSize: 12 }}>{fmt_short_date(t.date)}</span>
                      <span style={{ color: "rgba(255,255,255,.3)", fontSize: 11 }}>{t.time}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </>
        )}
          </div>
        </div>

        {/* Right rail — full analytics stack */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <WinLossCard holdings={holdings} />
          <BreakdownCard title="By team" items={team_items} chart="bars" on_open_team={on_open_team} />
          <BreakdownCard title="By position" items={position_items} chart="pie" />
          <BreakdownCard title="By age" items={age_items} chart="pie" />
        </aside>
      </div>

      {close_targets && (
        <ClosePositionsDialog open={true} positions={close_targets} on_close={dismiss_close_dialog} />
      )}
    </div>
  );
}

interface BreakdownItem {
  label: string;
  color: string;
  pct: number;
  v: number;
  /** Set only on the "By team" breakdown — turns the row label into a
   * link to that team's page. Absent on position / age breakdowns. */
  team_id?: string;
}

/** A breakdown row label, clickable to the team page when the item
 * carries a ``team_id`` and the card was given an ``on_open_team``. */
function ItemLabel({
  item,
  on_open_team,
}: {
  item: BreakdownItem;
  on_open_team?: (team_id: string) => void;
}) {
  if (item.team_id && on_open_team) {
    return (
      <TeamLink team_id={item.team_id} on_open_team={on_open_team}>
        {item.label}
      </TeamLink>
    );
  }
  return <>{item.label}</>;
}

function BreakdownCard({
  title,
  items,
  chart = "bars",
  large = false,
  on_open_team,
}: {
  title: string;
  items: BreakdownItem[];
  /** ``bars`` = per-row horizontal bars (best for many categories).
   *  ``pie`` = full pie chart + items list below (best for ≤ 6 segments). */
  chart?: "bars" | "pie";
  /** Bigger donut for the wider above-the-fold cards (pie variant only). */
  large?: boolean;
  /** When provided, item labels carrying a ``team_id`` link to the team. */
  on_open_team?: (team_id: string) => void;
}) {
  const segments = items.map(x => ({ value: x.v, color: x.color, label: x.label }));
  return (
    <div
      style={{
        background: "rgba(255,255,255,.02)",
        border: "1px solid rgba(255,255,255,.04)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "9px 14px",
          borderBottom: "1px solid rgba(255,255,255,.05)",
          fontSize: 11,
          fontWeight: 800,
          color: "rgba(255,255,255,.55)",
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      {chart === "pie" ? (
        <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <Donut segments={segments} size={large ? 140 : 110} />
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 1 }}>
            {items.map((item, i) => {
              const pct_num = item.pct;
              const is_negative = Number(pct_num.toFixed(1)) < 0;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "5px 0",
                    borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,.04)" : undefined,
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#fff" }}>
                      <ItemLabel item={item} on_open_team={on_open_team} />
                    </span>
                  </div>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: is_negative ? "var(--color-negative)" : "rgba(255,255,255,.75)",
                      flexShrink: 0,
                    }}
                  >
                    {fmt_signed_pct(item.pct, 1)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className="scroll-visible"
          style={{
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxHeight: 290,
            overflowY: "auto",
          }}
        >
          {items.map((item, i) => {
            const pct_num = item.pct;
            const is_negative = Number(pct_num.toFixed(1)) < 0;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#fff",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      minWidth: 0,
                    }}
                  >
                    <ItemLabel item={item} on_open_team={on_open_team} />
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: is_negative ? "var(--color-negative)" : "rgba(255,255,255,.75)",
                      flexShrink: 0,
                    }}
                  >
                    {fmt_signed_pct(item.pct, 1)}
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 2, background: "rgba(255,255,255,.04)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${Math.max(2, Math.abs(pct_num))}%`,
                      height: "100%",
                      background: is_negative ? "var(--color-negative)" : item.color,
                      borderRadius: 2,
                      transition: "width .3s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Player avatar: Sportmonks photo with the team-color jersey-number chip as
 * fallback (missing OR broken photo). Thin wrapper over the shared PlayerAvatar
 * so the positions list keeps its `{ player }` call shape. */
function PlayerAvatar({ player, team_color, size }: { player: Player; team_color: string; size: number }) {
  return (
    <PlayerAvatarBase
      image_path={player.image_path}
      jersey_number={player.jersey_number}
      team_color={team_color}
      size={size}
      radius={8}
      fit="contain"
      alt={player.full_name ?? player.name}
    />
  );
}

/** Mono value cell with a one-shot Bloomberg-style pulse on change. */
function PulseValueCell({ value, display }: { value: number; display: string }) {
  const pulse = usePulse(value);
  return (
    <span
      className={`mono ${pulse_class(pulse)}`}
      style={{ textAlign: "right", fontWeight: 800, padding: "1px 4px" }}
    >
      {display}
    </span>
  );
}

function KpiCard({
  label,
  value,
  color,
  title,
}: {
  label: string;
  value: string;
  color?: string;
  /** Optional hover tooltip — clarifies what the metric actually measures. */
  title?: string;
}) {
  return (
    <div
      title={title}
      style={{
        background: "rgba(255,255,255,.025)",
        border: "1px solid rgba(255,255,255,.05)",
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", letterSpacing: 0.4, textTransform: "uppercase", fontWeight: 600 }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: color ?? "#fff", marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

/** Win / Loss card — counts open positions by P&L sign. Stacked bar at the
 * top, three cells below: Winners / Flat / Losers. */
function WinLossCard({ holdings }: { holdings: HoldingMetrics[] }) {
  const winners = holdings.filter(h => h.pnl > 0).length;
  const losers = holdings.filter(h => h.pnl < 0).length;
  const flat = holdings.length - winners - losers;
  const total = holdings.length || 1;
  const win_pct = (winners / total) * 100;
  const loss_pct = (losers / total) * 100;
  const flat_pct = (flat / total) * 100;
  return (
    <div
      style={{
        background: "rgba(255,255,255,.02)",
        border: "1px solid rgba(255,255,255,.04)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "9px 14px",
          borderBottom: "1px solid rgba(255,255,255,.05)",
          fontSize: 11,
          fontWeight: 800,
          color: "rgba(255,255,255,.55)",
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        Trades Wins / Losses
      </div>
      <div style={{ padding: "12px 14px" }}>
        <div
          style={{
            height: 22,
            borderRadius: 5,
            overflow: "hidden",
            display: "flex",
            marginBottom: 10,
            border: "1px solid rgba(255,255,255,.06)",
          }}
        >
          {winners > 0 && (
            <div
              style={{
                width: `${win_pct}%`,
                background: "var(--color-positive)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>{win_pct.toFixed(0)}%</span>
            </div>
          )}
          {flat > 0 && (
            <div
              style={{
                width: `${flat_pct}%`,
                background: "rgba(255,255,255,.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.5)" }}>{flat_pct.toFixed(0)}%</span>
            </div>
          )}
          {losers > 0 && (
            <div
              style={{
                width: `${loss_pct}%`,
                background: "var(--color-negative)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>{loss_pct.toFixed(0)}%</span>
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <ExposureCell label="Winners" value={String(winners)} color="rgba(255,255,255,.85)" />
          <ExposureCell label="Flat" value={String(flat)} color="rgba(255,255,255,.7)" />
          <ExposureCell label="Losers" value={String(losers)} color="rgba(255,255,255,.85)" />
        </div>
      </div>
    </div>
  );
}

function ExposureCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phone-only presentation: hero cards + compact position / trade cards,
// mirroring the native Portfolio (apps/mobile/app/(tabs)/portfolio.tsx). The
// desktop two-pane layout above is untouched.
// ---------------------------------------------------------------------------

const mobile_card_style: CSSProperties = {
  background: "rgba(255,255,255,.025)",
  border: "1px solid rgba(255,255,255,.05)",
  borderRadius: 14,
  padding: "16px 16px",
};

function HeroCard({
  label,
  value,
  delta,
  delta_color,
  note,
}: {
  label: string;
  value: string;
  delta: string;
  delta_color: string;
  note: string;
}) {
  return (
    <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 14, padding: "14px 16px", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 800, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: delta_color, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{delta}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)", marginTop: 2 }}>{note}</div>
    </div>
  );
}

function MobileEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...mobile_card_style, textAlign: "center", color: "rgba(255,255,255,.3)", fontSize: 13, padding: 28 }}>{children}</div>
  );
}

function StripCell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,.35)", fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div className="mono" style={{ fontSize: 12.5, fontWeight: 800, color: color ?? "#fff", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      {sub && <div className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: color ?? "rgba(255,255,255,.45)", whiteSpace: "nowrap" }}>{sub}</div>}
    </div>
  );
}

function MobilePositionCard({
  h,
  opened,
  selected,
  on_toggle,
  on_open,
  on_open_team,
}: {
  h: HoldingDetail;
  opened?: string;
  selected: boolean;
  on_toggle: () => void;
  on_open: () => void;
  on_open_team?: (team_id: string) => void;
}) {
  const team = teams_api.get(h.player.team_id);
  return (
    <div
      onClick={on_open}
      style={{ ...mobile_card_style, padding: "12px", cursor: "pointer", ...(selected ? { border: "1px solid color-mix(in srgb, var(--color-accent-blue) 55%, transparent)" } : {}) }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        {/* Per-position select check — stops propagation so it never opens the
            player sheet. Same selection state the desktop table uses. */}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            on_toggle();
          }}
          aria-label={selected ? "Deselect position" : "Select position to close"}
          style={{
            flexShrink: 0,
            width: 20,
            height: 20,
            borderRadius: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 900,
            border: `1px solid ${selected ? "var(--color-accent-blue)" : "rgba(255,255,255,.25)"}`,
            background: selected ? "var(--color-accent-blue)" : "transparent",
            color: "var(--color-bg)",
          }}
        >
          {selected ? "✓" : ""}
        </button>
        <PlayerAvatar player={h.player} team_color={team?.color ?? "#666"} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.45)", flexShrink: 0 }}>{h.player.jersey_number}</span>
            <span style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{h.player.name}</span>
          </div>
          <TeamLink team_id={h.player.team_id} on_open_team={on_open_team} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 1, minWidth: 0 }}>
            <span style={{ flexShrink: 0 }}>{team?.flag}</span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{team?.name}</span>
            <span style={{ color: position_color[h.player.position], fontWeight: 700, flexShrink: 0 }}>· {POSITION_ABBR[h.player.position]}</span>
          </TeamLink>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="mono" style={{ fontSize: 13, fontWeight: 800 }}>{fmt_eur_m(h.current_price)}</div>
          <div className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>{fmt_eur_from_m(h.price_per_share)}/sh</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 9, paddingTop: 9, borderTop: "1px solid rgba(255,255,255,.06)" }}>
        <StripCell label="Opened" value={fmt_short_date(opened)} />
        <StripCell label="Shares" value={fmt_shares(Math.abs(h.display_shares))} />
        <StripCell label="Entry" value={fmt_eur_from_m(h.avg_buy_per_share)} />
        <StripCell label="Exposure" value={fmt_eur_m(Math.abs(h.market_value))} sub={`${Math.abs(h.portfolio_pct).toFixed(1)}%`} />
        <StripCell label="P&L" value={fmt_eur_m_signed(h.pnl)} sub={fmt_signed_pct(h.return_pct, 1)} color={color_for_sign(h.pnl)} />
      </div>
    </div>
  );
}

function MobileTradeCard({ t, on_open_team }: { t: Trade; on_open_team?: (team_id: string) => void }) {
  const team = teams_api.get(t.team_id);
  const player = players_api.get(t.player_id);
  const is_buy = t.kind === "buy";
  return (
    <div style={{ ...mobile_card_style, padding: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        {player && <PlayerAvatar player={player} team_color={team?.color ?? "#666"} size={32} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            {player && <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.45)", flexShrink: 0 }}>{player.jersey_number}</span>}
            <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{t.player_name}</span>
            <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, letterSpacing: 0.4, padding: "1px 5px", borderRadius: 3, color: "var(--color-bg)", background: is_buy ? "var(--color-action-buy)" : "var(--color-action-sell)" }}>
              {t.kind.toUpperCase()}
            </span>
          </div>
          <TeamLink team_id={t.team_id} on_open_team={on_open_team} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 1 }}>
            <span>{team?.flag}</span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team?.name}</span>
          </TeamLink>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="mono" style={{ fontSize: 13, fontWeight: 800 }}>{fmt_eur_m(t.total)}</div>
          <div className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>{fmt_short_date(t.date)}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 9, paddingTop: 9, borderTop: "1px solid rgba(255,255,255,.06)" }}>
        <StripCell label="Shares" value={fmt_shares(portfolio_api.to_display_shares(t.shares))} />
        <StripCell label="Price /sh" value={fmt_eur_from_m(portfolio_api.to_price_per_share(t.price))} />
        <StripCell label="Total" value={fmt_eur_m(t.total)} />
      </div>
    </div>
  );
}
