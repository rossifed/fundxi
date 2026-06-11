import { describe, expect, it } from "vitest";
import {
  compute_buy_shortfall,
  compute_cash_after,
  compute_quantity_from_pct,
  compute_quantity_from_shares,
  compute_realized_pnl,
  compute_shares_after,
  compute_short_quantity,
  compute_trade_share,
} from "./trade_calc";

describe("compute_quantity_from_pct", () => {
  it("budget sizes shares (floored to 0.1); amount = actual cost (shares × price)", () => {
    const { amount, shares } = compute_quantity_from_pct(1000, 25, 7);
    // budget = 250; shares = floor(250/7 * 10)/10 = floor(357.14)/10 = 35.7
    expect(shares).toBe(35.7);
    // amount is the cost the backend debits, NOT the gross budget: 35.7 × 7 = 249.9
    expect(amount).toBe(249.9);
  });

  it("amount rounds to the cent, capped by the floored share count", () => {
    // budget = 50.5 → shares = floor(50.5/10 * 10)/10 = floor(5.05*10)/10 = 5.0
    const { amount, shares } = compute_quantity_from_pct(101, 50, 10);
    expect(shares).toBe(5);
    expect(amount).toBe(50); // 5 × 10 (cost), not the 50.5 budget
  });

  it("zero current_price → zero shares (avoids div/0, no NaN)", () => {
    const { shares } = compute_quantity_from_pct(1000, 25, 0);
    expect(shares).toBe(0);
  });
});

describe("compute_quantity_from_shares", () => {
  it("amount = shares × price rounded to the cent", () => {
    expect(compute_quantity_from_shares(3, 7)).toEqual({ amount: 21, shares: 3 });
    expect(compute_quantity_from_shares(2.5, 7)).toEqual({ amount: 17.5, shares: 2.5 });
  });
});

describe("compute_trade_share", () => {
  it("returns integer % of portfolio represented by the amount", () => {
    expect(compute_trade_share(50, 200)).toBe(25);
  });
  it("guards divide-by-zero", () => {
    expect(compute_trade_share(50, 0)).toBe(0);
  });
});

describe("compute_short_quantity", () => {
  it("zero on buys", () => {
    expect(compute_short_quantity("buy", 10, 5)).toBe(0);
  });
  it("zero when selling within the held quantity", () => {
    expect(compute_short_quantity("sell", 5, 10)).toBe(0);
    expect(compute_short_quantity("sell", 10, 10)).toBe(0);
  });
  it("returns the over-sold quantity, rounded to 0.1", () => {
    expect(compute_short_quantity("sell", 13, 10)).toBe(3);
    expect(compute_short_quantity("sell", 10.27, 10)).toBe(0.3); // round(2.7/10) = 3 → 0.3
  });
});

describe("compute_shares_after", () => {
  it("buy adds shares", () => {
    expect(compute_shares_after("buy", 5, 3)).toBe(8);
  });
  it("sell subtracts shares — can go negative (opens a short)", () => {
    expect(compute_shares_after("sell", 5, 8)).toBe(-3);
  });
});

describe("compute_cash_after", () => {
  it("buy reduces cash", () => {
    expect(compute_cash_after("buy", 100, 30)).toBe(70);
  });
  it("sell increases cash", () => {
    expect(compute_cash_after("sell", 100, 30)).toBe(130);
  });
});

describe("compute_realized_pnl", () => {
  it("zero on a buy", () => {
    expect(compute_realized_pnl("buy", 5, 10, 8, 5)).toBe(0);
  });
  it("zero when there are no held shares to close", () => {
    expect(compute_realized_pnl("sell", 5, 10, 8, 0)).toBe(0);
  });
  it("(current_price - avg_buy) × closing_shares (capped at held)", () => {
    // selling 3 shares of a 5-share long, avg buy 6, current price 10
    expect(compute_realized_pnl("sell", 3, 10, 6, 5)).toBe(12); // (10-6)*3
  });
  it("caps closing_shares at the held quantity (the extra is a short, no realized PnL on that leg)", () => {
    expect(compute_realized_pnl("sell", 8, 10, 6, 5)).toBe(20); // only 5 shares close → (10-6)*5
  });
  it("loss on close: price below avg buy", () => {
    expect(compute_realized_pnl("sell", 4, 5, 8, 10)).toBe(-12); // (5-8)*4
  });
});

describe("compute_buy_shortfall", () => {
  it("no shortfall on a sell (sells generate cash)", () => {
    expect(compute_buy_shortfall("sell", 1000, 100)).toEqual({ insufficient: false, shortfall: 0 });
  });
  it("no shortfall when buy amount fits cash", () => {
    expect(compute_buy_shortfall("buy", 50, 100)).toEqual({ insufficient: false, shortfall: 0 });
  });
  it("returns the missing amount when buy exceeds cash", () => {
    expect(compute_buy_shortfall("buy", 150, 100)).toEqual({ insufficient: true, shortfall: 50 });
  });
});
