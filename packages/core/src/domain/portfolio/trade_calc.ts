/* trade_calc — pure trade-related calculations.
 *
 * DDD role: Domain Service. Deterministic, no I/O. Holds the formulas
 * the application's ``simulate_trade`` orchestration relies on, so each
 * piece is unit-testable in isolation and reusable from anywhere
 * (preview, execution, server-side replay, etc.).
 *
 * Conventions:
 *   - Prices are in €M per share.
 *   - Shares are quantized to a 0.1 increment (fractional shares).
 *   - ``amount`` is the trade's ACTUAL cost/proceeds = shares × price,
 *     rounded to the cent (2 decimals) — the SAME value the backend debits
 *     (``total = round(shares × price, 2)``). So the preview's cash math
 *     reconciles with execution (no integer-€M rounding skew at the margin).
 */

import type { TradeKind } from "./trade";

const SHARES_QUANTUM = 10; // shares are floored to 0.1 (1/10) increments

/** Smallest tradeable share lot (the quantum). A trade can never be smaller
 * than this, so for a very expensive player the min lot can already be a large
 * € amount (e.g. 0.1 × €200M = €20M) — the UI uses it to explain why a small
 * percentage rounds to zero shares. */
export const MIN_LOT_SHARES = 1 / SHARES_QUANTUM;

/** Cost (€M) of the smallest tradeable lot at the given price. */
export function compute_min_lot_cost(current_price: number): number {
  return round_money(MIN_LOT_SHARES * current_price);
}

/** Round a €M money value to the cent — mirrors the backend's
 * ``round(value, 2)`` so the preview and the executed trade agree. */
function round_money(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Compute (amount, shares) when the user sizes a trade by a % of
 * portfolio. The percentage sets a spend BUDGET; shares are floor-rounded
 * to the 0.1 increment so the cost never exceeds that budget (and a buy
 * never over-commits). ``amount`` is the resulting actual cost
 * (shares × price), not the gross budget — what the backend will debit. */
export function compute_quantity_from_pct(
  portfolio_value: number,
  pct: number,
  current_price: number,
): { amount: number; shares: number } {
  const budget = (portfolio_value * pct) / 100;
  const shares = current_price === 0 ? 0 : Math.floor((budget / current_price) * SHARES_QUANTUM) / SHARES_QUANTUM;
  return { amount: round_money(shares * current_price), shares };
}

/** Compute (amount, shares) when the user sizes a trade by an explicit
 * share count. ``amount`` = shares × price rounded to the cent. */
export function compute_quantity_from_shares(
  shares: number,
  current_price: number,
): { amount: number; shares: number } {
  return { amount: round_money(shares * current_price), shares };
}

/** Percentage of the portfolio represented by the trade amount.
 * Returns 0 when the portfolio is empty. */
export function compute_trade_share(amount: number, portfolio_value: number): number {
  if (portfolio_value === 0) return 0;
  return Math.round((amount / portfolio_value) * 100);
}

/** Quantity that would be sold *short* (i.e. beyond the held position).
 * Zero unless kind=sell AND requested shares > current holding. */
export function compute_short_quantity(
  kind: TradeKind,
  requested_shares: number,
  held_shares: number,
): number {
  if (kind !== "sell" || requested_shares <= held_shares) return 0;
  return Math.round((requested_shares - held_shares) * SHARES_QUANTUM) / SHARES_QUANTUM;
}

/** Holding position after the trade is applied.
 * - Buy increases the share count; sell decreases (can go negative ⇒ short). */
export function compute_shares_after(
  kind: TradeKind,
  held_shares: number,
  trade_shares: number,
): number {
  return kind === "buy" ? held_shares + trade_shares : held_shares - trade_shares;
}

/** Cash balance after the trade.
 * - Buy reduces cash by ``amount``; sell increases it. */
export function compute_cash_after(kind: TradeKind, cash_before: number, amount: number): number {
  return kind === "buy" ? cash_before - amount : cash_before + amount;
}

/** Realized P&L locked in by the trade.
 * - Only meaningful on a SELL of held shares. Beyond the held quantity
 *   the user is opening a short and there's no realized P&L on that leg.
 * - Returns 0 when kind=buy, no holding, or selling 0 held shares. */
export function compute_realized_pnl(
  kind: TradeKind,
  trade_shares: number,
  current_price: number,
  avg_buy_price: number,
  held_shares: number,
): number {
  if (kind !== "sell" || held_shares <= 0) return 0;
  const closing_shares = Math.min(trade_shares, held_shares);
  return (current_price - avg_buy_price) * closing_shares;
}

/** Does this BUY exceed the available cash? Returns the shortfall (0 if not). */
export function compute_buy_shortfall(
  kind: TradeKind,
  amount: number,
  cash_before: number,
): { insufficient: boolean; shortfall: number } {
  if (kind !== "buy" || amount <= cash_before) return { insufficient: false, shortfall: 0 };
  return { insufficient: true, shortfall: amount - cash_before };
}
