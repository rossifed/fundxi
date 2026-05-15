/* TradeOutcome — derived view of a Trade enriched with how the player's
 * current market price compares to the trade price.
 *
 * DDD role: Value Object + pure Domain Service. Zero I/O, deterministic.
 * The interpretation of ``change_pct`` (good or bad) depends on
 * ``Trade.kind``: for a BUY a positive change_pct is a paid-off entry;
 * for a SELL it means you exited too early. The UI applies the sign
 * convention; the domain just exposes the raw price-vs-trade delta. */

import type { Trade } from "./trade";

export interface TradeOutcome extends Trade {
  /** Current market price for the player (€M / share). */
  current_price: number;
  /** Signed % change of the player's price since the trade.
   *  ``null`` when the trade price is 0 (avoids divide-by-zero). */
  change_pct: number | null;
}

export function compute_trade_outcome(trade: Trade, current_price: number): TradeOutcome {
  const change_pct =
    trade.price === 0 ? null : ((current_price - trade.price) / trade.price) * 100;
  return { ...trade, current_price, change_pct };
}
