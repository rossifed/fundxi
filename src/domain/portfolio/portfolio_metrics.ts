import type { Holding } from "./holding";

export interface PortfolioTotals {
  cash: number; // €M, free cash
  market_value: number; // €M, sum(price × shares)
  total_value: number; // €M, AUM = cash + market_value
  total_cost: number; // €M, sum(avg_buy × shares)
  pnl: number; // €M
  return_pct: number; // %, pnl / total_cost
}

export interface HoldingMetrics extends Holding {
  current_price: number;
  market_value: number;
  cost_basis: number;
  pnl: number;
  return_pct: number;
}

export function compute_holding_metrics(holding: Holding, current_price: number): HoldingMetrics {
  const market_value = current_price * holding.shares;
  const cost_basis = holding.average_buy_price * holding.shares;
  return {
    ...holding,
    current_price,
    market_value,
    cost_basis,
    pnl: market_value - cost_basis,
    return_pct: cost_basis === 0 ? 0 : ((market_value - cost_basis) / cost_basis) * 100,
  };
}

export function compute_portfolio_totals(
  holdings: Holding[],
  prices_by_player_id: Map<number, number>,
  cash: number,
): PortfolioTotals {
  let market_value = 0;
  let total_cost = 0;
  for (const h of holdings) {
    const price = prices_by_player_id.get(h.player_id);
    if (price === undefined) continue;
    market_value += price * h.shares;
    total_cost += h.average_buy_price * h.shares;
  }
  const pnl = market_value - total_cost;
  return {
    cash,
    market_value,
    total_value: cash + market_value,
    total_cost,
    pnl,
    return_pct: total_cost === 0 ? 0 : (pnl / total_cost) * 100,
  };
}
