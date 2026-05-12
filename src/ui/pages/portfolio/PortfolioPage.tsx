import { useEffect, useMemo, useState } from "react";
import { players_api } from "@/api/players_api";
import { portfolio_api } from "@/api/portfolio_api";
import { teams_api } from "@/api/teams_api";
import { valuations_api } from "@/api/valuations_api";
import { POSITION_LABEL } from "@/domain/player/player";
import type { Player } from "@/domain/player/player";
import { PlayerChip } from "@/ui/components/PlayerChip";
import { PositionBadge } from "@/ui/components/PositionBadge";
import { PerformanceChart } from "@/ui/components/PerformanceChart";
import { Donut } from "@/ui/components/Donut";
import { spark_market_index } from "@/infrastructure/repositories/valuations_repository";
import { fmt_eur_m, fmt_eur_m_signed, fmt_shares } from "@/ui/helpers/format";
import { usePricesLiveVersion, useLiveRefetch } from "@/ui/hooks/use_live_updates";

type PositionsTab = "positions" | "trades";

const CHART_PALETTE = [
  "rgba(255,255,255,.7)",
  "rgba(255,255,255,.5)",
  "rgba(255,255,255,.35)",
  "rgba(255,255,255,.22)",
  "rgba(255,255,255,.14)",
  "rgba(255,255,255,.09)",
  "rgba(255,255,255,.06)",
  "rgba(255,255,255,.04)",
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

  // Single chart: portfolio value rebased onto the real market index
  // (= average of every player's price over the tournament). v0 has no
  // per-trade history × price-tick join yet, so we approximate the
  // portfolio curve as `total_value × index_t / index_T`. Same shape as
  // the market for an evenly-weighted book; will be replaced once we
  // compute holdings × historical prices on the backend.
  const performance_data = useMemo(() => {
    const idx = spark_market_index(120);
    const last = idx[idx.length - 1] || 1;
    return idx.map(v => ({ v: Math.round((v / last) * total_value) }));
  }, [total_value]);
  const period_return =
    performance_data.length > 1
      ? ((performance_data[performance_data.length - 1].v - performance_data[0].v) / performance_data[0].v) * 100
      : 0;

  const sorted_holdings = useMemo(() => [...holdings].sort((a, b) => b.market_value - a.market_value), [holdings]);

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <KpiCard label="Total Value" value={fmt_eur_m(total_value)} />
        <KpiCard label="Cash" value={fmt_eur_m(totals.cash)} />
        <KpiCard label="Invested" value={fmt_eur_m(totals.total_cost)} />
        <KpiCard label="Positions" value={String(holdings.length)} />
        <KpiCard
          label="P&L"
          value={fmt_eur_m_signed(pnl)}
          color={pnl >= 0 ? "#216c6e" : "#E41541"}
        />
        <KpiCard
          label="Return"
          value={`${return_pct >= 0 ? "+" : ""}${return_pct.toFixed(1)}%`}
          color={return_pct >= 0 ? "#216c6e" : "#E41541"}
        />
      </div>

      {/* Performance chart */}
      <div
        style={{
          background: "rgba(255,255,255,.02)",
          border: "1px solid rgba(255,255,255,.04)",
          borderRadius: 12,
          padding: "16px 20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Performance</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 2 }}>Since tournament start</div>
          </div>
          <span className="mono" style={{ fontSize: 18, fontWeight: 800, color: period_return >= 0 ? "#216c6e" : "#E41541" }}>
            {period_return >= 0 ? "+" : ""}{period_return.toFixed(1)}%
          </span>
        </div>
        <PerformanceChart data={performance_data} width={1100} height={220} />
      </div>

      {/* Breakdown — stacked, all visible at once */}
      <BreakdownCard title="By team" items={team_items} />
      <BreakdownCard title="By position" items={position_items} />
      <BreakdownCard title="By age" items={age_items} />
      <ExposureCard total_value={total_value} />

      {/* Positions / Trade history — single column, tabbed */}
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
                gridTemplateColumns: "minmax(0, 2.4fr) 90px 90px 110px 100px 90px",
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
              <span>Pos</span>
              <span style={{ textAlign: "right" }}>Shares</span>
              <span style={{ textAlign: "right" }}>Avg buy</span>
              <span style={{ textAlign: "right" }}>Value</span>
              <span style={{ textAlign: "right" }}>P&L</span>
            </div>
            {sorted_holdings.map(h => {
              const team = teams_api.get(h.player.team_id);
              return (
                <div
                  key={h.player_id}
                  onClick={() => on_open_player(h.player)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 2.4fr) 90px 90px 110px 100px 90px",
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
                    <PlayerChip jersey_number={h.player.jersey_number} team_color={team?.color ?? "#666"} size={30} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {h.player.name}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)", display: "flex", alignItems: "center", gap: 4 }}>
                        <span>{team?.flag}</span>
                        <span>{team?.name}</span>
                      </div>
                    </div>
                  </div>
                  <PositionBadge position={h.player.position} />
                  <span className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{fmt_shares(h.shares)}</span>
                  <span className="mono" style={{ textAlign: "right", color: "rgba(255,255,255,.55)" }}>
                    €{h.average_buy_price}M
                  </span>
                  <span className="mono" style={{ textAlign: "right", fontWeight: 800 }}>
                    {fmt_eur_m(h.market_value)}
                  </span>
                  <span
                    className="mono"
                    style={{
                      textAlign: "right",
                      fontWeight: 700,
                      color: h.pnl >= 0 ? "#216c6e" : "#E41541",
                    }}
                  >
                    {h.pnl >= 0 ? "+" : ""}{h.return_pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "70px minmax(0, 1.8fr) 90px 90px 110px 90px",
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
              <span>Type</span>
              <span>Player</span>
              <span style={{ textAlign: "right" }}>Shares</span>
              <span style={{ textAlign: "right" }}>Price</span>
              <span style={{ textAlign: "right" }}>Total</span>
              <span style={{ textAlign: "right" }}>Date</span>
            </div>
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
                      gridTemplateColumns: "70px minmax(0, 1.8fr) 90px 90px 110px 90px",
                      padding: "11px 18px",
                      borderBottom: "1px solid rgba(255,255,255,.025)",
                      alignItems: "center",
                      gap: 12,
                      fontSize: 13,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "3px 8px",
                        borderRadius: 4,
                        background: is_buy ? "rgba(34,197,94,.1)" : "rgba(255,40,93,.1)",
                        color: is_buy ? "#216c6e" : "#E41541",
                        textAlign: "center",
                        letterSpacing: 0.5,
                        width: "fit-content",
                      }}
                    >
                      {t.kind.toUpperCase()}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      {player && (
                        <PlayerChip
                          jersey_number={player.jersey_number}
                          team_color={team?.color ?? "#666"}
                          size={28}
                        />
                      )}
                      <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t.player_name}
                      </span>
                    </div>
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
          </>
        )}
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

function BreakdownCard({ title, items }: { title: string; items: BreakdownItem[] }) {
  const segments = items.map(x => ({ value: x.v, color: x.color }));
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
        {title}
      </div>
      <div style={{ padding: 18, display: "flex", alignItems: "flex-start", gap: 24 }}>
        <Donut segments={segments} size={120} />
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "2px 24px",
          }}
        >
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 0",
                borderBottom: "1px solid rgba(255,255,255,.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.label}
                </span>
              </div>
              <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
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
        Long / Short
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
            background: "rgba(55,255,99,.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: "#216c6e" }}>📈 {long_pct}%</span>
        </div>
        <div
          style={{
            width: short_pct + "%",
            background: "rgba(255,40,93,.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: "#E41541" }}>📉 {short_pct}%</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <ExposureCell label="Long" value={fmt_eur_m(long_value)} color="#216c6e" />
        <ExposureCell label="Short" value={fmt_eur_m(short_value)} color="#E41541" />
        <ExposureCell label="Net" value={fmt_eur_m_signed(net_exposure)} color="rgba(255,255,255,.7)" />
      </div>
      <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12 }}>
          <span style={{ color: "rgba(255,255,255,.35)" }}>L/S Ratio</span>
          <span className="mono" style={{ fontWeight: 700 }}>
            {short_value > 0 ? `${(long_value / short_value).toFixed(1)}x` : "∞"}
          </span>
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
