/* compute_portfolio_history — reconstruct the user's portfolio value
 * curve from per-player price sparklines and current holdings.
 *
 * DDD role: pure Domain Service. Zero I/O. Given a snapshot of holdings
 * + each held player's historical sparkline of length N, returns N
 * values representing portfolio_value at each historical point.
 *
 * Formula:    history[t] = cash + Σ shares_h × price_h(t) for each h in holdings.
 *
 * Notes:
 *   - "Cash" is treated as a constant baseline. We don't replay trade
 *     history yet (no per-trade timestamp × tick join), so cash is held
 *     fixed at its current value. This is an acceptable v0 simplification
 *     — the bulk of the variance comes from price moves of held assets.
 *   - Negative shares (shorts) naturally subtract: their sparkline goes
 *     up → the user's position loses value, which is the correct sign.
 */

import type { Holding } from "./holding";

export function compute_portfolio_history(
  holdings: readonly Holding[],
  cash: number,
  sparkline_for: (player_id: number) => readonly number[],
  length: number,
): number[] {
  const out = new Array<number>(length).fill(cash);
  for (const h of holdings) {
    const spark = sparkline_for(h.player_id);
    if (spark.length === 0) continue;
    for (let i = 0; i < length; i++) {
      // Resample: when the sparkline length differs, take the i-th
      // proportionally. Avoids skewing if a player has a shorter feed.
      const idx = Math.min(spark.length - 1, Math.floor((i / Math.max(1, length - 1)) * (spark.length - 1)));
      out[i] += (spark[idx] ?? 0) * h.shares;
    }
  }
  return out;
}
