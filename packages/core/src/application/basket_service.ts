/* basket_service — "buy the team" multi-player order.
 *
 * DDD role: Application Service. Two responsibilities, both pure orchestration:
 *   - ``simulate_basket``: pull cash / prices / holdings from the application
 *     services, delegate the split + sizing to the ``basket_calc`` domain
 *     service, return a per-player preview the UI renders.
 *   - ``execute_basket``: place each leg as a normal buy via an injected
 *     executor (mirrors ``close_positions``), so this module stays free of HTTP.
 *
 * A basket is just a set of single buys sized from one budget — the same
 * ``trades_api.execute`` path, the same backend validation, per leg.
 */

import {
  type BasketPlayerInput,
  type BasketWeighting,
  compute_basket,
} from "@fundxi/core/domain/portfolio/basket_calc";
import { to_display_shares } from "@fundxi/core/domain/portfolio/trade_calc";
import { get_shares_per_player } from "@fundxi/core/infrastructure/runtime_config";
import { portfolio_service } from "./portfolio_service";
import { valuation_service } from "./valuation_service";

export type { BasketWeighting } from "@fundxi/core/domain/portfolio/basket_calc";

export interface BasketPreviewInput {
  player_ids: readonly number[]; // the selected players
  percentage: number; // 0-100, share of available cash committed to the basket
  weighting: BasketWeighting;
}

export interface BasketLinePreview {
  player_id: number;
  total_value: number; // the player's whole value (price), €M
  shares: number; // ownership fraction to buy
  display_shares: number; // shares × N
  amount: number; // €M, the leg's actual cost
  capped: boolean; // the player-value cap trimmed this leg
}

export interface BasketPreview {
  lines: BasketLinePreview[];
  budget: number; // cash × percentage / 100
  total_amount: number; // sum of the legs (≤ budget after flooring/caps)
  cash_before: number;
  cash_after: number;
  percentage: number;
  weighting: BasketWeighting;
}

/** Preview a basket buy: size every selected player from one cash budget. */
export function simulate_basket(input: BasketPreviewInput): BasketPreview {
  const cash_before = portfolio_service.get_my_cash();
  const n = get_shares_per_player();
  const budget = (cash_before * input.percentage) / 100;

  const players: BasketPlayerInput[] = input.player_ids.map(id => ({
    player_id: id,
    total_value: valuation_service.get_current_price(id),
    held_fraction: portfolio_service.get_holding_for(id)?.shares ?? 0,
  }));

  const plan = compute_basket(budget, players, input.weighting, n);
  const by_id = new Map(players.map(p => [p.player_id, p]));
  const lines: BasketLinePreview[] = plan.lines.map(l => ({
    player_id: l.player_id,
    total_value: by_id.get(l.player_id)?.total_value ?? 0,
    shares: l.shares,
    display_shares: to_display_shares(l.shares, n),
    amount: l.amount,
    capped: l.capped,
  }));

  return {
    lines,
    budget,
    total_amount: plan.total_amount,
    cash_before,
    cash_after: cash_before - plan.total_amount,
    percentage: input.percentage,
    weighting: input.weighting,
  };
}

/** One leg to buy: the ownership fraction at the player's current price. */
export interface BasketBuy {
  player_id: number;
  shares: number;
  price: number;
}

/** Executes a single leg. Rejects on backend error. */
export type BasketExecutor = (buy: BasketBuy) => Promise<void>;

/** Per-batch outcome — every leg is attempted; one failure never aborts the
 * rest. ``bought`` / ``failed`` partition the legs that were actually traded. */
export interface BasketOutcome {
  bought: number[];
  failed: { player_id: number; error: string }[];
}

/** Place each leg via ``execute``, sequentially.
 *
 * Sequential on purpose (like ``close_positions``): every buy mutates the same
 * portfolio cash server-side, so concurrent writes would race. Basket size is a
 * team roster — latency is a non-issue. A leg with no shares (sized to zero) is
 * skipped. One failure does not abort the batch: each leg is reported. */
export async function execute_basket(buys: readonly BasketBuy[], execute: BasketExecutor): Promise<BasketOutcome> {
  const bought: number[] = [];
  const failed: BasketOutcome["failed"] = [];
  for (const buy of buys) {
    if (buy.shares <= 0) continue; // nothing to buy on this leg
    try {
      await execute(buy);
      bought.push(buy.player_id);
    } catch (err) {
      failed.push({ player_id: buy.player_id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { bought, failed };
}
