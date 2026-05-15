import { useEffect, useMemo, useState } from "react";
import { compute_period_return } from "@/domain/market/return";
import { players_api } from "@/api/players_api";
import { portfolio_api } from "@/api/portfolio_api";
import { teams_api } from "@/api/teams_api";
import { valuations_api } from "@/api/valuations_api";
import { POSITION_LABEL } from "@/domain/player/player";
import type { Player } from "@/domain/player/player";
import type { HoldingMetrics } from "@/domain/portfolio/portfolio_metrics";
import { PlayerChip } from "@/ui/components/PlayerChip";
import { PositionBadge } from "@/ui/components/PositionBadge";
import { PerformanceChart } from "@/ui/components/PerformanceChart";
import { Donut } from "@/ui/components/Donut";
import { fmt_eur_m, fmt_eur_m_signed, fmt_shares } from "@/ui/helpers/format";

function fmt_short_date(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
import { usePricesLiveVersion, useLiveRefetch } from "@/ui/hooks/use_live_updates";
import { pulse_class, usePulse } from "@/ui/hooks/use_pulse";

type PositionsTab = "positions" | "trades";

// Palette built around the PerformanceChart accent ``var(--color-chart-primary)``. Same
// hue family, slightly brighter so the fill-opacity on the Pie cells
// (~0.55) reveals the gradient background through the slices —
// matches the semi-transparent feel of the perf chart's area fill.
const CHART_PALETTE = [
  "#7C92E5",
  "#5E7AD4",
  "#4561C2",
  "#3F5BBE",
  "#2D4AA5",
  "#1F3D8B",
  "var(--color-chart-primary)",
  "#15326D",
];

interface PortfolioPageProps {
  on_open_player: (player: Player) => void;
}

export function PortfolioPage({ on_open_player }: PortfolioPageProps) {
  // Live refresh: a price tick anywhere re-fetches current prices, then bumps
  // a local version so the memoised reads below recompute. A trade (any
  // in-place portfolio mutation) bumps it too — the repo cache is already
  // updated by the trade execution, so no re-fetch is needed there.
  const prices_live_version = usePricesLiveVersion();
  const [data_version, set_data_version] = useState(0);
  useLiveRefetch(prices_live_version, () => {
    void valuations_api.refresh().then(() => set_data_version(v => v + 1));
  });
  useEffect(() => portfolio_api.subscribe(() => set_data_version(v => v + 1)), []);

  const holdings = useMemo(() => portfolio_api.get_holdings(), [data_version]);
  const trades = useMemo(() => portfolio_api.list_trades(), [data_version]);
  const totals = useMemo(() => portfolio_api.get_totals(), [data_version]);
  const total_value = totals.total_value;
  const pnl = totals.pnl;
  const return_pct = totals.return_pct;

  const by_team = useMemo(() => {
    const map: Record<string, { name: string; flag: string; v: number }> = {};
    for (const h of holdings) {
      const team = teams_api.get(h.player.team_id);
      if (!team) continue;
      if (!map[team.id]) map[team.id] = { name: team.name, flag: team.flag, v: 0 };
      map[team.id].v += h.market_value;
    }
    return Object.values(map)
      .map(x => ({ ...x, pct: ((x.v / total_value) * 100).toFixed(1) }))
      .sort((a, b) => b.v - a.v);
  }, [holdings, total_value]);

  const by_position = useMemo(() => {
    const map: Partial<Record<string, number>> = {};
    for (const h of holdings) {
      map[h.player.position] = (map[h.player.position] ?? 0) + h.market_value;
    }
    return Object.entries(map)
      .map(([k, v]) => ({
        key: k,
        label: POSITION_LABEL[k as keyof typeof POSITION_LABEL],
        v: v ?? 0,
        pct: (((v ?? 0) / total_value) * 100).toFixed(1),
      }))
      .sort((a, b) => b.v - a.v);
  }, [holdings, total_value]);

  const by_age = useMemo(() => {
    const buckets = [
      { label: "U21", lo: 0, hi: 21 },
      { label: "21-25", lo: 21, hi: 26 },
      { label: "26-30", lo: 26, hi: 31 },
      { label: "31+", lo: 31, hi: 99 },
    ];
    const acc: Record<string, { label: string; v: number }> = {};
    for (const b of buckets) acc[b.label] = { label: b.label, v: 0 };
    for (const h of holdings) {
      const age = h.player.age ?? 25;
      const b = buckets.find(b => age >= b.lo && age < b.hi) ?? buckets[3];
      acc[b.label].v += h.market_value;
    }
    return Object.values(acc)
      .filter(x => x.v > 0)
      .map(x => ({ ...x, pct: ((x.v / total_value) * 100).toFixed(1) }));
  }, [holdings, total_value]);

  const [positions_tab, set_positions_tab] = useState<PositionsTab>("positions");

  // Real portfolio curve: cash + Σ shares × price_t for each held
  // player, derived from per-player sparklines in the domain layer
  // (``compute_portfolio_history``). Reflects the user's actual book —
  // a concentration on Messi makes the curve look like Messi's price.
  const performance_data = useMemo(
    () => portfolio_api.get_portfolio_history(120).map(v => ({ v })),
    [data_version],
  );
  const period_return = useMemo(
    () => compute_period_return(performance_data.map(p => p.v)),
    [performance_data],
  );

  const sorted_holdings = useMemo(() => [...holdings].sort((a, b) => b.market_value - a.market_value), [holdings]);

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

  const team_items = by_team.map((t, i) => ({
    label: `${t.flag} ${t.name}`,
    color: CHART_PALETTE[i] ?? CHART_PALETTE.at(-1)!,
    pct: t.pct,
    v: t.v,
  }));
  const position_items = by_position.map((p, i) => ({
    label: p.label,
    color: CHART_PALETTE[i] ?? CHART_PALETTE.at(-1)!,
    pct: p.pct,
    v: p.v,
  }));
  const age_items = by_age.map((a, i) => ({
    label: a.label,
    color: CHART_PALETTE[i] ?? CHART_PALETTE.at(-1)!,
    pct: a.pct,
    v: a.v,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 12 }}>
        <KpiCard label="Total Value" value={fmt_eur_m(total_value)} />
        <KpiCard label="Cash" value={fmt_eur_m(totals.cash)} />
        <KpiCard label="Invested" value={fmt_eur_m(totals.total_cost)} />
        <KpiCard label="Positions" value={String(holdings.length)} />
        <KpiCard
          label="P&L"
          value={fmt_eur_m_signed(pnl)}
          color={pnl >= 0 ? "var(--color-positive)" : "var(--color-negative)"}
        />
        <KpiCard
          label="Return"
          value={`${return_pct >= 0 ? "+" : ""}${return_pct.toFixed(1)}%`}
          color={return_pct >= 0 ? "var(--color-positive)" : "var(--color-negative)"}
        />
        <KpiCard label="Trades" value={String(trades.length)} />
      </div>

      {/* Row-aligned grid: each "row" places a left-col widget next to
          its right-rail counterpart so their headers line up vertically.
          Row 1: Perf chart        | Long/Short + Wins/Losses stack
          Row 2: Position/Age pies | By team
          Row 3: Positions/Trades spans both columns. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 340px",
          columnGap: 16,
          rowGap: 16,
          alignItems: "start",
        }}
      >
        {/* Row 1 left — Performance chart */}
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
              <div style={{ fontSize: 14, fontWeight: 800 }}>Performance</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 2 }}>Since tournament start</div>
            </div>
            <span className="mono" style={{ fontSize: 18, fontWeight: 800, color: period_return >= 0 ? "var(--color-positive)" : "var(--color-negative)" }}>
              {period_return >= 0 ? "+" : ""}{period_return.toFixed(1)}%
            </span>
          </div>
          <PerformanceChart data={performance_data} height={220} />
        </div>

        {/* Row 1 right — Long/Short + Wins/Losses stacked */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ExposureCard total_value={total_value} />
          <WinLossCard holdings={holdings} />
        </div>

        {/* Row 2 — Positions / Trade history (full width, primary view) */}
        <div
          style={{
            gridColumn: "1 / -1",
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.04)",
            borderRadius: 12,
            overflow: "hidden",
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "280px 70px 80px 100px 80px 100px 100px 90px",
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
              <span>Player</span>
              <span>Side</span>
              <span>Pos</span>
              <span>Opened</span>
              <span style={{ textAlign: "right" }}>Shares</span>
              <span style={{ textAlign: "right" }}>Avg buy</span>
              <span style={{ textAlign: "right" }}>Value</span>
              <span style={{ textAlign: "right" }}>P&L</span>
            </div>
            <div className="scroll-visible" style={{ maxHeight: 480, overflowY: "auto" }}>
            {sorted_holdings.map(h => {
              const team = teams_api.get(h.player.team_id);
              return (
                <div
                  key={h.player_id}
                  onClick={() => on_open_player(h.player)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "280px 70px 80px 100px 80px 100px 100px 90px",
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
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)", display: "flex", alignItems: "center", gap: 4 }}>
                        <span>{team?.flag}</span>
                        <span>{team?.name}</span>
                      </div>
                    </div>
                  </div>
                  <span><SideBadge shares={h.shares} /></span>
                  <PositionBadge position={h.player.position} />
                  <span className="mono" style={{ fontSize: 12, color: "rgba(255,255,255,.55)" }}>
                    {fmt_short_date(opened_by_player.get(h.player_id))}
                  </span>
                  <span className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{fmt_shares(h.shares)}</span>
                  <span className="mono" style={{ textAlign: "right", color: "rgba(255,255,255,.55)" }}>
                    €{h.average_buy_price}M
                  </span>
                  <PulseValueCell value={h.market_value} display={fmt_eur_m(h.market_value)} />
                  <span
                    className="mono"
                    style={{
                      textAlign: "right",
                      fontWeight: 700,
                      color: h.pnl >= 0 ? "var(--color-positive)" : "var(--color-negative)",
                    }}
                  >
                    {h.pnl >= 0 ? "+" : ""}{h.return_pct.toFixed(1)}%
                  </span>
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
                gridTemplateColumns: "280px 70px 90px 90px 110px 90px",
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
              <span>Player</span>
              <span>Type</span>
              <span style={{ textAlign: "right" }}>Shares</span>
              <span style={{ textAlign: "right" }}>Price</span>
              <span style={{ textAlign: "right" }}>Total</span>
              <span style={{ textAlign: "right" }}>Date</span>
            </div>
            <div className="scroll-visible" style={{ maxHeight: 480, overflowY: "auto" }}>
            {trades
              .slice()
              .reverse()
              .map(t => {
                const team = teams_api.get(t.team_id);
                const player = players_api.get(t.player_id);
                const is_buy = t.kind === "buy";
                return (
                  <div
                    key={t.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "280px 70px 90px 90px 110px 90px",
                      padding: "11px 18px",
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
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)", display: "flex", alignItems: "center", gap: 4 }}>
                          <span>{team?.flag}</span>
                          <span>{team?.name}</span>
                        </div>
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
                    <span style={{ textAlign: "right", color: "rgba(255,255,255,.35)", fontSize: 12 }}>{t.date}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

        {/* Row 3 — Breakdowns row, full-width 3-col (secondary analytics) */}
        <div
          style={{
            gridColumn: "1 / -1",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
            minWidth: 0,
          }}
        >
          <BreakdownCard title="By position" items={position_items} chart="pie" large />
          <BreakdownCard title="By age" items={age_items} chart="pie" large />
          <BreakdownCard title="By team" items={team_items} chart="bars" />
        </div>
      </div>

    </div>
  );
}

interface BreakdownItem {
  label: string;
  color: string;
  pct: string;
  v: number;
}

function BreakdownCard({
  title,
  items,
  chart = "bars",
  large = false,
}: {
  title: string;
  items: BreakdownItem[];
  /** ``bars`` = per-row horizontal bars (best for many categories).
   *  ``pie`` = full pie chart + items list below (best for ≤ 6 segments). */
  chart?: "bars" | "pie";
  /** Bigger donut for the wider above-the-fold cards (pie variant only). */
  large?: boolean;
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
        <div style={{ padding: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Donut segments={segments} size={large ? 140 : 130} />
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 1 }}>
            {items.map((item, i) => {
              const pct_num = parseFloat(item.pct);
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
                      {item.label}
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
                    {pct_num >= 0 ? "+" : ""}{item.pct}%
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
            const pct_num = parseFloat(item.pct);
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
                    {item.label}
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
                    {pct_num >= 0 ? "+" : ""}{item.pct}%
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

/** Player avatar: Sportmonks photo when available, falls back to the
 * team-color jersey-number chip. Same pattern as the Screener. */
function PlayerAvatar({ player, team_color, size }: { player: Player; team_color: string; size: number }) {
  if (player.image_path) {
    return (
      <img
        src={player.image_path}
        alt={player.full_name ?? player.name}
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          objectFit: "contain",
          background: "rgba(255,255,255,.05)",
          border: "1px solid rgba(255,255,255,.08)",
          flexShrink: 0,
        }}
      />
    );
  }
  return <PlayerChip jersey_number={player.jersey_number} team_color={team_color} size={size} />;
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

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
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
          padding: "12px 18px",
          borderBottom: "1px solid rgba(255,255,255,.05)",
          fontSize: 12,
          fontWeight: 800,
          color: "rgba(255,255,255,.55)",
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        Trades Wins / Losses
      </div>
      <div style={{ padding: 18 }}>
        <div
          style={{
            height: 30,
            borderRadius: 6,
            overflow: "hidden",
            display: "flex",
            marginBottom: 14,
            border: "1px solid rgba(255,255,255,.06)",
          }}
        >
          {winners > 0 && (
            <div
              style={{
                width: `${win_pct}%`,
                background: "color-mix(in srgb, var(--color-positive) 22%, transparent)",
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
                background: "color-mix(in srgb, var(--color-negative) 22%, transparent)",
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

function ExposureCard({ total_value }: { total_value: number }) {
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
          padding: "12px 18px",
          borderBottom: "1px solid rgba(255,255,255,.05)",
          fontSize: 12,
          fontWeight: 800,
          color: "rgba(255,255,255,.55)",
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        Position Long / Short
      </div>
      <div style={{ padding: 18 }}>
        <ExposureView total_value={total_value} />
      </div>
    </div>
  );
}

function ExposureView({ total_value }: { total_value: number }) {
  // v0: long-only book. Shorts will land when the trade engine supports
  // them; until then the exposure card reflects the actual portfolio.
  const long_value = total_value;
  const short_value = 0;
  const total_exposure = long_value + short_value || 1;
  const long_pct = ((long_value / total_exposure) * 100).toFixed(1);
  const short_pct = ((short_value / total_exposure) * 100).toFixed(1);
  const net_exposure = long_value - short_value;
  return (
    <div>
      <div
        style={{
          height: 30,
          borderRadius: 6,
          overflow: "hidden",
          display: "flex",
          marginBottom: 14,
          border: "1px solid rgba(255,255,255,.06)",
        }}
      >
        <div
          style={{
            width: long_pct + "%",
            background: "color-mix(in srgb, var(--color-positive) 22%, transparent)",
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
            background: "color-mix(in srgb, var(--color-negative) 22%, transparent)",
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
          color={net_exposure >= 0 ? "var(--color-positive)" : "var(--color-negative)"}
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
