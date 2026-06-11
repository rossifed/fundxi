import type { Holding } from "./holding";

export interface PortfolioTotals {
  cash: number; // €M, free cash
  market_value: number; // €M, sum(price × shares)
  total_value: number; // €M, AUM = cash + market_value
  total_cost: number; // €M, sum(avg_buy × shares) — nets long vs short
  pnl: number; // €M
  return_pct: number; // %, pnl / invested capital base (cash + total_cost)
}

export interface HoldingMetrics extends Holding {
  current_price: number;
  market_value: number;
  cost_basis: number;
  pnl: number;
  return_pct: number;
}

/** Share of the portfolio represented by a position's market value.
 * Returns 0 when ``total_value`` is 0 (no portfolio). */
export function compute_portfolio_share(market_value: number, total_value: number): number {
  if (total_value === 0) return 0;
  return (market_value / total_value) * 100;
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
    // Divide by the MAGNITUDE of capital committed so the sign of the return
    // tracks the P&L, not the sign of the shares. A winning short (shares < 0,
    // cost_basis < 0) must show a POSITIVE return — dividing by the signed
    // cost_basis would flip it.
    return_pct: cost_basis === 0 ? 0 : ((market_value - cost_basis) / Math.abs(cost_basis)) * 100,
  };
}

export function compute_portfolio_totals(
  holdings: readonly Holding[],
  prices_by_player_id: ReadonlyMap<number, number>,
  cash: number,
): PortfolioTotals {
  let market_value = 0;
  let total_cost = 0;
  for (const h of holdings) {
    // Price comes from the valuation surface (tick ?? base) — the SAME rule the
    // backend snapshot/history service marks at (SqlAlchemyCurrentPriceProvider),
    // so the totals card, the per-holding list, and the server value curve agree
    // by construction (COHERENCE-INVARIANT). The cost-basis fall back is a last
    // resort for a holding with no valuation entry at all (never for a tradeable
    // player), keeping its line flat (P&L 0) rather than dropping it.
    const price = prices_by_player_id.get(h.player_id) ?? h.average_buy_price;
    market_value += price * h.shares;
    total_cost += h.average_buy_price * h.shares;
  }
  const pnl = market_value - total_cost;
  // Return is measured against the invested CAPITAL BASE, not the net cost.
  // `cash + total_cost` is the account's opening value (= total_value − pnl):
  // it stays ~stable at the starting AUM and, crucially, does NOT net to ~0
  // when a long and a short of similar size offset in `total_cost` — which
  // would otherwise make `pnl / total_cost` explode (a tiny P&L over a
  // near-zero denominator showed bogus returns like +32% on a flat book).
  // When no position has been closed this equals (total_value − opening_cash)
  // / opening_cash, matching the server's `pnl_vs_open` (COHERENCE-INVARIANT).
  const invested_base = cash + total_cost;
  return {
    cash,
    market_value,
    total_value: cash + market_value,
    total_cost,
    pnl,
    return_pct: invested_base <= 0 ? 0 : (pnl / invested_base) * 100,
  };
}
