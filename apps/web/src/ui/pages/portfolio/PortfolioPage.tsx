import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { compute_period_return } from "@fundxi/core/domain/market/return";
import { players_api } from "@fundxi/core/api/players_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { POSITION_ABBR } from "@fundxi/core/domain/player/player";
import type { Player } from "@fundxi/core/domain/player/player";
import { compute_portfolio_breakdowns } from "@fundxi/core/domain/portfolio/portfolio_breakdown";
import type { HoldingMetrics } from "@fundxi/core/domain/portfolio/portfolio_metrics";
import type { Trade } from "@fundxi/core/domain/portfolio/trade";
import { chart_category_ramp } from "@fundxi/core/design/palette";
import { ClosePositionsDialog } from "@/ui/components/ClosePositionsDialog";
import { PlayerAvatar as PlayerAvatarBase } from "@/ui/components/PlayerAvatar";
import { PerformanceChart } from "@/ui/components/PerformanceChart";
import { Donut } from "@/ui/components/Donut";
import { SortableHeader, type SortDir } from "@/ui/components/SortableHeader";
import { TeamLink } from "@/ui/components/TeamLink";
import { color_for_sign, fmt_eur_m, fmt_eur_m_signed, fmt_shares, fmt_signed_pct } from "@/ui/helpers/format";
import { position_color } from "@/ui/design/tokens";

function fmt_short_date(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
import { useLiveValuations } from "@/ui/hooks/use_live_valuations";
import { pulse_class, usePulse } from "@/ui/hooks/use_pulse";

type PositionsTab = "positions" | "trades";

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
    case "side": return Math.sign(h.shares); // long (+1) vs short (-1)
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
// Checkbox + 8 columns: Player, Side, Opened, Shares, Avg buy, Price,
// Value, P&L. (Position is shown as an acronym inside the Player cell,
// not as a dedicated column — it carries no financial meaning here.)
const POSITIONS_GRID =
  "34px minmax(0,2.4fr) minmax(0,0.75fr) minmax(0,0.95fr) minmax(0,0.7fr) " +
  "minmax(0,0.95fr) minmax(0,0.95fr) minmax(0,0.95fr) minmax(0,1.15fr)";

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
  const pnl = totals.pnl;
  const return_pct = totals.return_pct;
  // Allocation slices (by team / position / age) + win-rate: single source
  // shared with mobile (packages/core domain). The UI only maps these to
  // display items below — no calculation leaks here. See COHERENCE-INVARIANT.
  const breakdowns = useMemo(
    () => compute_portfolio_breakdowns(holdings, total_value, id => teams_api.get(id)),
    [holdings, total_value],
  );
  const win_rate = breakdowns.win_rate;

  const [positions_tab, set_positions_tab] = useState<PositionsTab>("positions");

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
  const period_return = useMemo(
    () => compute_period_return(performance_data.map(p => p.v)),
    [performance_data],
  );

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 12 }}>
        <KpiCard
          label="Total Value"
          value={fmt_eur_m(total_value)}
          title="Everything you own right now: free cash + market value of every position"
        />
        <KpiCard label="Cash" value={fmt_eur_m(totals.cash)} title="Free cash available to trade" />
        <KpiCard
          label="Invested"
          value={fmt_eur_m(totals.total_cost)}
          title="What you paid for your current positions (sum of avg buy price x shares)"
        />
        <KpiCard label="Positions" value={String(holdings.length)} title="Number of open positions" />
        <KpiCard
          label="P&L"
          value={fmt_eur_m_signed(pnl)}
          color={color_for_sign(pnl)}
          title="Unrealised profit / loss on open positions = market value - invested. Equals the sum of the P&L column in the positions table."
        />
        <KpiCard
          label="Return"
          value={`${fmt_signed_pct(return_pct, 1)}`}
          color={color_for_sign(return_pct)}
          title="P&L as a percentage of what you invested (P&L / Invested). Profit on your positions vs their cost — not the same as the Portfolio value chart, which tracks total value (incl. cash) over time."
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
          gridTemplateColumns: "minmax(0, 1fr) 340px",
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>Portfolio value</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 2 }}>
                  Total value (cash + positions) since portfolio open
                </div>
              </div>
              <span
                className="mono"
                title="Change in total portfolio value since you opened the portfolio"
                style={{ fontSize: 18, fontWeight: 800, color: color_for_sign(period_return) }}
              >
                {fmt_signed_pct(period_return, 1)}
              </span>
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: POSITIONS_GRID,
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
                  { key: "side", label: "Side", align: "left" },
                  { key: "opened", label: "Opened", align: "left" },
                  { key: "shares", label: "Shares", align: "right" },
                  { key: "avg_buy", label: "Avg buy", align: "right" },
                  { key: "price", label: "Price", align: "right" },
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
            <div className="scroll-visible" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
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
                  <span><SideBadge shares={h.shares} /></span>
                  <span className="mono" style={{ fontSize: 12, color: "rgba(255,255,255,.55)" }}>
                    {fmt_short_date(opened_by_player.get(h.player_id))}
                  </span>
                  <span className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{fmt_shares(h.shares)}</span>
                  <span className="mono" style={{ textAlign: "right", color: "rgba(255,255,255,.55)" }}>
                    €{h.average_buy_price}M
                  </span>
                  <PulseValueCell value={h.current_price} display={fmt_eur_m(h.current_price)} />
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
          </>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 52px 74px 76px 92px 90px",
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
                  { key: "price", label: "Price", align: "right" },
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
            <div className="scroll-visible" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
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
                    <span className="mono" style={{ textAlign: "right" }}>{fmt_shares(t.shares)}</span>
                    <span className="mono" style={{ textAlign: "right", color: "rgba(255,255,255,.55)" }}>
                      €{t.price}M
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
          </>
        )}
          </div>
        </div>

        {/* Right rail — full analytics stack */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ExposureCard long_value={totals.long_value} short_value={totals.short_value} />
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
              const is_negative = pct_num < 0;
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
                    {pct_num >= 0 ? "+" : ""}{item.pct.toFixed(1)}%
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
            const is_negative = pct_num < 0;
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
                    {pct_num >= 0 ? "+" : ""}{item.pct.toFixed(1)}%
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

function SideBadge({ shares }: { shares: number }) {
  const is_short = shares < 0;
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        padding: "1px 5px",
        borderRadius: 3,
        letterSpacing: 0.4,
        flexShrink: 0,
        background: is_short ? "var(--color-negative)" : "var(--color-positive)",
        color: "#fff",
      }}
    >
      {is_short ? "SHORT" : "LONG"}
    </span>
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

/** Win / Loss card — same layout as ``ExposureCard`` (Long / Short)
 * but counts open positions by P&L sign. Stacked bar at the top,
 * three cells below: Winners / Flat / Losers. */
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

function ExposureCard({ long_value, short_value }: { long_value: number; short_value: number }) {
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
        Position Long / Short
      </div>
      <div style={{ padding: "12px 14px" }}>
        <ExposureView long_value={long_value} short_value={short_value} />
      </div>
    </div>
  );
}

function ExposureView({ long_value, short_value }: { long_value: number; short_value: number }) {
  // Gross long vs gross short market value (single source: compute_portfolio_totals).
  // The bar splits the GROSS exposure (long + short); Net = long − short.
  const total_exposure = long_value + short_value || 1;
  const long_pct = ((long_value / total_exposure) * 100).toFixed(1);
  const short_pct = ((short_value / total_exposure) * 100).toFixed(1);
  const net_exposure = long_value - short_value;
  return (
    <div>
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
        <div
          style={{
            width: long_pct + "%",
            background: "var(--color-positive)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>{long_pct}%</span>
        </div>
        <div
          style={{
            width: short_pct + "%",
            background: "var(--color-negative)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>{short_pct}%</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <ExposureCell label="Long" value={fmt_eur_m(long_value)} color="rgba(255,255,255,.85)" />
        <ExposureCell label="Short" value={fmt_eur_m(short_value)} color="rgba(255,255,255,.85)" />
        <ExposureCell
          label="Net"
          value={fmt_eur_m_signed(net_exposure)}
          color={color_for_sign(net_exposure)}
        />
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
