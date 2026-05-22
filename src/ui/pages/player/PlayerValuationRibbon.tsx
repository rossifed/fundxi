/* PlayerValuationRibbon — the 6-KPI valuation strip above the chart.
 *
 * DDD role: presentational UI component. Reads the viewer's holding
 * from the api layer; every percentage delegates to domain functions.
 */

import { portfolio_api } from "@/api/portfolio_api";
import { compute_period_return } from "@/domain/market/return";
import type { PlayerTournamentStat } from "@/infrastructure/repositories/player_stats_repository";
import type { PricePoint } from "@/infrastructure/repositories/valuations_repository";
import { TickValue } from "@/ui/components/TickValue";
import { color_for_sign, fmt_eur_m_signed, fmt_signed_pct } from "@/ui/helpers/format";
import { SectionCard, SmallKpi } from "@/ui/pages/player/player_sheet_ui";

interface PlayerValuationRibbonProps {
  player_id: number;
  current_price: number;
  performance_rating: number;
  price_history: PricePoint[] | null;
  tournament_stats: PlayerTournamentStat | null | undefined;
}

export function PlayerValuationRibbon({
  player_id,
  current_price,
  performance_rating,
  price_history,
  tournament_stats,
}: PlayerValuationRibbonProps) {
  const own_holding = portfolio_api.get_holding(player_id);
  const own_shares = own_holding?.shares ?? 0;
  const pnl = own_shares !== 0 ? own_shares * (current_price - (own_holding?.average_buy_price ?? 0)) : null;

  const ph = price_history ?? [];
  const since_start_pct = ph.length > 1 ? compute_period_return(ph.map(p => p.price)) : null;
  let last_match_pct: number | null = null;
  if (ph.length > 1) {
    const last_fixture_id = [...ph].reverse().find(p => p.fixture_id !== null)?.fixture_id;
    if (last_fixture_id != null) {
      const ticks = ph.filter(p => p.fixture_id === last_fixture_id);
      if (ticks.length > 1) last_match_pct = compute_period_return(ticks.map(t => t.price));
    }
  }
  const apps = tournament_stats?.appearances ?? null;
  const avg_match_pct = since_start_pct !== null && apps && apps > 0 ? since_start_pct / apps : null;

  const fmt_pct = (v: number | null): string => (v === null ? "—" : fmt_signed_pct(v, 1));
  const pct_color = (v: number | null): string | undefined => (v === null ? undefined : color_for_sign(v));

  return (
    <SectionCard title="Valuation">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 0 }}>
        <SmallKpi label="Value" value={<TickValue value={current_price}>€{current_price}M</TickValue>} />
        <SmallKpi label="Rating" value={String(performance_rating)} color="rgba(255,255,255,.85)" />
        <SmallKpi
          label="P&L"
          value={pnl !== null ? fmt_eur_m_signed(pnl) : "—"}
          color={pnl !== null ? color_for_sign(pnl) : undefined}
        />
        <SmallKpi label="Since Start" value={fmt_pct(since_start_pct)} color={pct_color(since_start_pct)} />
        <SmallKpi label="Last Match" value={fmt_pct(last_match_pct)} color={pct_color(last_match_pct)} />
        <SmallKpi label="Avg / Match" value={fmt_pct(avg_match_pct)} color={pct_color(avg_match_pct)} />
      </div>
    </SectionCard>
  );
}
