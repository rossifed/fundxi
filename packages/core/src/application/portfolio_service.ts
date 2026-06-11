import type { Player } from "@fundxi/core/domain/player/player";
import type { Holding } from "@fundxi/core/domain/portfolio/holding";
import {
  compute_holding_metrics,
  compute_portfolio_totals,
  type HoldingMetrics,
  type PortfolioTotals,
} from "@fundxi/core/domain/portfolio/portfolio_metrics";
import { compute_trade_outcome, type TradeOutcome } from "@fundxi/core/domain/portfolio/trade_outcome";
import { players_repository } from "@fundxi/core/infrastructure/repositories/players_repository";
import { portfolio_repository } from "@fundxi/core/infrastructure/repositories/portfolio_repository";
import { trades_repository } from "@fundxi/core/infrastructure/repositories/trades_repository";
import { valuations_repository } from "@fundxi/core/infrastructure/repositories/valuations_repository";

export interface HoldingDetail extends HoldingMetrics {
  player: Player;
}

function build_prices_index(): Map<number, number> {
  return new Map(valuations_repository.find_all().map(v => [v.player_id, v.current_price]));
}

export const portfolio_service = {
  get_my_totals(): PortfolioTotals {
    return compute_portfolio_totals(
      portfolio_repository.find_my_holdings(),
      build_prices_index(),
      portfolio_repository.find_my_cash(),
    );
  },

  get_my_holdings_with_metrics(): HoldingDetail[] {
    const holdings = portfolio_repository.find_my_holdings();
    return holdings
      .map(h => {
        const player = players_repository.find_by_id(h.player_id);
        if (!player) return null;
        // Price = valuation surface (tick ?? base), matching compute_portfolio_totals
        // and the backend snapshot/history service (SqlAlchemyCurrentPriceProvider)
        // so the totals card and this list never disagree (COHERENCE-INVARIANT).
        // Cost basis is only the last-resort fallback when no valuation exists.
        const price =
          valuations_repository.find_by_player_id(h.player_id)?.current_price ?? h.average_buy_price;
        const metrics = compute_holding_metrics(h, price);
        return { ...metrics, player };
      })
      .filter((x): x is HoldingDetail => x !== null);
  },

  get_holding_for(player_id: number): Holding | undefined {
    return portfolio_repository.find_my_holdings().find(h => h.player_id === player_id);
  },

  get_my_cash(): number {
    return portfolio_repository.find_my_cash();
  },

  /** Trade history enriched with the live "price-vs-trade" outcome,
   * sorted newest-first. The UI just consumes — no calculation
   * leaks into the view layer. */
  get_my_trades_with_outcomes(): TradeOutcome[] {
    const trades = trades_repository.find_all();
    return trades
      .map(t => {
        const current_price = valuations_repository.find_by_player_id(t.player_id)?.current_price ?? t.price;
        return compute_trade_outcome(t, current_price);
      })
      .slice()
      .reverse();
  },
};
