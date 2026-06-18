/* basket_calc — size a multi-player "buy the team" basket.
 *
 * DDD role: Domain Service. Deterministic, no I/O. Splits a single cash budget
 * across several players by a weighting strategy, then sizes each leg with the
 * SAME rules a single buy uses (``buy_quantity_from_cash_pct`` → floor to the
 * share quantum, cap at the player's whole value and the remaining headroom).
 *
 * Model:
 *   - ``budget`` (€M) is the cash the user commits to the whole basket
 *     (= available cash × the chosen %).
 *   - Each selected player gets a slice of that budget:
 *       · "equal"        → budget / N, the same € on every player;
 *       · "market_value" → proportional to the player's whole value (price),
 *         so pricier players take a bigger slice.
 *   - Each slice is then sized like a normal buy: whole shares only, the
 *     leftover stays as cash (no fractional shares — transparent, like a single
 *     trade). Legs never redistribute their residual to others in v1.
 *
 * The sum of the legs is therefore ≤ budget (flooring + per-player caps leave a
 * residual); the caller shows the real total so the user sees exactly what is
 * deployed.
 */

import { buy_quantity_from_cash_pct } from "./trade_calc";

export type BasketWeighting = "equal" | "market_value";

/** One player considered for the basket. ``total_value`` is the player's whole
 * market value (price); ``held_fraction`` is the long already owned (≥ 0). */
export interface BasketPlayerInput {
  player_id: number;
  total_value: number;
  held_fraction: number;
}

/** The sized buy for one player. ``shares`` is the ownership fraction to buy,
 * ``amount`` its actual cost; ``capped`` flags a leg trimmed by the player cap. */
export interface BasketLine {
  player_id: number;
  shares: number;
  amount: number;
  capped: boolean;
}

export interface BasketPlan {
  lines: BasketLine[];
  /** Sum of every leg's actual cost (≤ budget after flooring/caps). */
  total_amount: number;
}

/** Per-player share of the budget for a weighting. Returns one weight per input,
 * in [0, 1], summing to 1 (or all-zero only when no player can take any). */
function budget_weights(players: readonly BasketPlayerInput[], weighting: BasketWeighting): number[] {
  const n = players.length;
  if (n === 0) return [];
  if (weighting === "equal") return players.map(() => 1 / n);

  // market_value: proportional to each player's whole value. If the total value
  // is non-positive (all un-priced), fall back to an equal split rather than 0.
  const total = players.reduce((sum, p) => sum + Math.max(0, p.total_value), 0);
  if (total <= 0) return players.map(() => 1 / n);
  return players.map(p => Math.max(0, p.total_value) / total);
}

/** Build the basket plan: split ``budget`` across ``players`` by ``weighting``
 * and size each leg with the single-trade rules. */
export function compute_basket(
  budget: number,
  players: readonly BasketPlayerInput[],
  weighting: BasketWeighting,
  shares_per_player: number,
): BasketPlan {
  const weights = budget_weights(players, weighting);
  const lines: BasketLine[] = players.map((p, i) => {
    const leg_budget = Math.max(0, budget) * weights[i];
    // Reuse the single-buy sizing: a per-leg budget at 100% = that budget spent.
    const { amount, shares, capped } = buy_quantity_from_cash_pct(
      leg_budget,
      100,
      p.total_value,
      shares_per_player,
      p.held_fraction,
    );
    return { player_id: p.player_id, shares, amount, capped };
  });
  const total_amount = Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
  return { lines, total_amount };
}
