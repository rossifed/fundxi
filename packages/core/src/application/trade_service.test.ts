import { beforeEach, describe, expect, it } from "vitest";
import { simulate_trade, type TradePreview } from "./trade_service";
import { _set_from_outcome } from "@fundxi/core/infrastructure/repositories/portfolio_repository";
import type { Player } from "@fundxi/core/domain/player/player";

// These tests verify the ORCHESTRATION wiring of simulate_trade (which service
// value feeds which trade_calc argument), not the formulas themselves —
// trade_calc is unit-tested in isolation. Inputs are chosen so every output
// field has a unique value a swapped argument would change.
//
// State setup: seed cash + one holding via the portfolio repo. No valuation is
// seeded, so get_my_totals marks the holding at cost → total_value is exactly
// cash + shares*avg_buy. current_price is passed as an override on every input.

const player: Player = { id: 1, name: "P1", jersey_number: 9, team_id: "ARG", position: "FW" };

// Holding: 5 shares @ €8 cost. Cash 100. → total_value = 100 + 5*8 = 140.
beforeEach(() => {
  _set_from_outcome({
    id: 1,
    user_id: 1,
    cash: 100,
    holdings: [{ player_id: 1, shares: 5, average_buy_price: 8 }],
  });
});

describe("simulate_trade — buy by shares", () => {
  let p: TradePreview;
  beforeEach(() => {
    p = simulate_trade({ player, kind: "buy", mode: "shares", shares: 3, current_price: 10 });
  });

  it("sizes amount from the override price (3 × €10 = €30), not the valuation service", () => {
    expect(p.shares).toBe(3);
    expect(p.amount).toBe(30);
  });
  it("adds to the position and debits cash", () => {
    expect(p.held_shares).toBe(5);
    expect(p.shares_after).toBe(8); // 5 + 3
    expect(p.cash_before).toBe(100);
    expect(p.cash_after).toBe(70); // 100 - 30
  });
  it("is not a short, has no realized P&L, and is affordable", () => {
    expect(p.is_short).toBe(false);
    expect(p.short_quantity).toBe(0);
    expect(p.realized_pnl).toBe(0);
    expect(p.insufficient_capital).toBe(false);
    expect(p.shortfall).toBe(0);
  });
  it("computes the share of the portfolio against total_value (30/140)", () => {
    expect(p.percentage_of_portfolio).toBe(21); // round(30/140*100)
  });
});

describe("simulate_trade — sell beyond the holding (opens a short)", () => {
  let p: TradePreview;
  beforeEach(() => {
    p = simulate_trade({ player, kind: "sell", mode: "shares", shares: 8, current_price: 10 });
  });

  it("flags the short leg (8 sold vs 5 held)", () => {
    expect(p.is_short).toBe(true);
    expect(p.short_quantity).toBe(3); // 8 - 5
    expect(p.shares_after).toBe(-3); // 5 - 8
  });
  it("credits cash on a sell", () => {
    expect(p.cash_after).toBe(180); // 100 + 80
  });
  it("realizes P&L only on the closed (held) leg", () => {
    // closing 5 held shares at €10 vs €8 cost = +10. The 3 short shares add none.
    expect(p.realized_pnl).toBe(10);
  });
});

describe("simulate_trade — percentage mode", () => {
  it("uses the percentage branch (50% of €140 at €10 → 7 shares, €70)", () => {
    const p = simulate_trade({ player, kind: "buy", mode: "percentage", percentage: 50, current_price: 10 });
    // A swapped branch would read input.shares (undefined → 0) and yield 0.
    expect(p.shares).toBe(7);
    expect(p.amount).toBe(70);
    expect(p.shares_after).toBe(12); // 5 + 7
    expect(p.cash_after).toBe(30); // 100 - 70
    expect(p.percentage_of_portfolio).toBe(50);
  });
});

describe("simulate_trade — insufficient capital on a buy", () => {
  it("reports the shortfall when the amount exceeds cash", () => {
    const p = simulate_trade({ player, kind: "buy", mode: "shares", shares: 20, current_price: 10 });
    expect(p.amount).toBe(200);
    expect(p.insufficient_capital).toBe(true);
    expect(p.shortfall).toBe(100); // 200 - 100
  });
});

describe("simulate_trade — no holding for the player", () => {
  it("defaults held_shares/avg_buy to 0 and reports no realized P&L on a sell", () => {
    const other: Player = { ...player, id: 999 };
    const p = simulate_trade({ player: other, kind: "sell", mode: "shares", shares: 2, current_price: 10 });
    expect(p.held_shares).toBe(0);
    expect(p.short_quantity).toBe(2); // entire sell is short
    expect(p.realized_pnl).toBe(0); // nothing held to close
  });
});
