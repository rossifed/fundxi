/* PlayerValuationRibbon — the 6-KPI valuation strip above the chart.
 *
 * DDD role: presentational UI component. Every percentage is read from the
 * authoritative valuation (the backend's single semantic contract), NOT
 * recomputed client-side — so the sheet can never contradict the card, the
 * screener or the backend (COHERENCE-INVARIANT / backend-owns-semantic-contract).
 */

import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import type { PlayerTournamentStat } from "@fundxi/core/infrastructure/repositories/player_stats_repository";
import { TickValue } from "@/ui/components/TickValue";
import { color_for_sign, fmt_eur_m_signed, fmt_signed_pct } from "@/ui/helpers/format";
import { SectionCard, SmallKpi } from "@/ui/pages/player/player_sheet_ui";

interface PlayerValuationRibbonProps {
  player_id: number;
  current_price: number;
  performance_rating: number;
  tournament_stats: PlayerTournamentStat | null | undefined;
}

export function PlayerValuationRibbon({
  player_id,
  current_price,
  performance_rating,
  tournament_stats,
}: PlayerValuationRibbonProps) {
  // P&L from the single core source (get_holding_metrics) — same price
  // resolution as the holdings list / AUM and the mobile ribbon, so this header
  // P&L can't diverge across clients or contradict the Your-position card.
  const metrics = portfolio_api.get_holding_metrics(player_id);
  const pnl = metrics && metrics.shares !== 0 ? metrics.pnl : null;

  // Since-Start and Last-Match read STRAIGHT from the valuation — the SAME source
  // the roster card and screener use. They used to be recomputed here from the
  // price-history chart (compute_period_return), which anchored on the first
  // chart point and disagreed with the backend's tournament-open anchor (e.g.
  // "Last Match" −0.2% while the card showed +0.2%). Avg/Match mirrors the
  // screener + mobile formula (since-start ÷ appearances), kept identical so the
  // three surfaces reconcile. (COHERENCE-INVARIANT.)
  const valuation = valuations_api.get_for_player(player_id);
  const since_start_pct = valuation?.change_since_inception ?? null;
  const last_match_pct = valuation?.change_last_match ?? null;
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
