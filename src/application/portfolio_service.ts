import type { Player } from "@/domain/player/player";
import type { Holding } from "@/domain/portfolio/holding";
import {
  compute_holding_metrics,
  compute_portfolio_totals,
  type HoldingMetrics,
  type PortfolioTotals,
} from "@/domain/portfolio/portfolio_metrics";
import { compute_portfolio_history } from "@/domain/portfolio/portfolio_history";
import { compute_trade_outcome, type TradeOutcome } from "@/domain/portfolio/trade_outcome";
import { players_repository } from "@/infrastructure/repositories/players_repository";
import { portfolio_repository } from "@/infrastructure/repositories/portfolio_repository";
import { trades_repository } from "@/infrastructure/repositories/trades_repository";
import { spark_for_player, valuations_repository } from "@/infrastructure/repositories/valuations_repository";

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
        const price = valuations_repository.find_by_player_id(h.player_id)?.current_price ?? 0;
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

  /** Portfolio value curve reconstructed from the holdings × each
   * player's historical price sparkline. Reflects the user's actual
   * book (concentration in a single player → curve looks like that
   * player's price). Recompute on every price tick to see live moves. */
  get_my_portfolio_history(length = 120): number[] {
    return compute_portfolio_history(
      portfolio_repository.find_my_holdings(),
      portfolio_repository.find_my_cash(),
      spark_for_player,
      length,
    );
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
