import { beforeEach, describe, expect, it } from "vitest";
import { portfolio_service } from "./portfolio_service";
import { compute_holding_metrics } from "@fundxi/core/domain/portfolio/portfolio_metrics";
import { _set_from_outcome } from "@fundxi/core/infrastructure/repositories/portfolio_repository";
import { get_shares_per_player } from "@fundxi/core/infrastructure/runtime_config";

// get_holding_metrics is the SINGLE source the per-player "Your position" card
// uses on web AND mobile. These tests pin its contract: same formula as
// compute_holding_metrics, same price resolution as the holdings list/AUM
// (valuation tick ?? cost basis), undefined when not held.
//
// No valuation is seeded here (the repo populates from the network), so the
// price falls back to average_buy_price — which is itself a behaviour we must
// guarantee (an un-ticked holding marks flat, P&L 0, like the portfolio total).

beforeEach(() => {
  _set_from_outcome({
    id: 1,
    user_id: 1,
    cash: 100,
    holdings: [
      { player_id: 1, shares: 5, average_buy_price: 8 }, // long
      { player_id: 2, shares: -4, average_buy_price: 10 }, // short
    ],
  });
});

describe("portfolio_service.get_holding_metrics", () => {
  it("returns undefined for a player that is not held", () => {
    expect(portfolio_service.get_holding_metrics(999)).toBeUndefined();
  });

  it("falls back to cost basis when the player has no valuation (flat, P&L 0)", () => {
    const m = portfolio_service.get_holding_metrics(1);
    expect(m).toBeDefined();
    // price = average_buy_price (8) → market_value = 5*8 = 40, P&L 0.
    expect(m!.current_price).toBe(8);
    expect(m!.market_value).toBe(40);
    expect(m!.pnl).toBe(0);
    expect(m!.return_pct).toBe(0);
  });

  it("computes exactly compute_holding_metrics(holding, price) — no divergent arithmetic", () => {
    const holding = portfolio_service.get_holding_for(1)!;
    const expected = compute_holding_metrics(holding, holding.average_buy_price, get_shares_per_player());
    expect(portfolio_service.get_holding_metrics(1)).toEqual(expected);
  });

  it("handles a short position (negative shares ⇒ negative market_value)", () => {
    const m = portfolio_service.get_holding_metrics(2)!;
    // price = avg 10 → market_value = -4*10 = -40, P&L 0 at cost.
    expect(m.market_value).toBe(-40);
    expect(m.pnl).toBe(0);
  });
});
