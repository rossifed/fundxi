import { describe, expect, it } from "vitest";
import {
  cap_trade_fraction,
  compute_buy_shortfall,
  compute_cash_after,
  compute_quantity_from_pct,
  compute_quantity_from_shares,
  compute_realized_pnl,
  compute_shares_after,
  compute_short_quantity,
  compute_trade_share,
  fraction_from_display_shares,
  MAX_OWNERSHIP_FRACTION,
  pct_of_player,
  price_per_share,
  to_display_shares,
  trade_headroom_fraction,
} from "./trade_calc";

const N = 1_000_000; // shares_per_player used across the display-denomination tests

describe("denomination helpers", () => {
  it("price_per_share splits the whole value into N shares", () => {
    expect(price_per_share(0.8, N)).toBeCloseTo(8e-7, 12); // €0.80 of a €0.8M player
    expect(price_per_share(200, N)).toBeCloseTo(2e-4, 10); // €200 of a €200M player
    expect(price_per_share(0.8, 0)).toBe(0); // guard div/0
  });

  it("to_display_shares / fraction_from_display_shares round-trip through N", () => {
    expect(to_display_shares(0.74, N)).toBe(740_000);
    expect(fraction_from_display_shares(740_000, N)).toBeCloseTo(0.74, 12);
    expect(fraction_from_display_shares(50_000, 0)).toBe(0); // guard div/0
  });

  it("pct_of_player turns a fraction into a percentage", () => {
    expect(pct_of_player(0.74)).toBe(74);
    expect(pct_of_player(-1)).toBe(-100);
  });
});

describe("position cap (±100% of the player)", () => {
  it("MAX_OWNERSHIP_FRACTION is the whole player", () => {
    expect(MAX_OWNERSHIP_FRACTION).toBe(1);
  });

  it("trade_headroom_fraction: a buy fills toward +1, a sell-to-open toward −1", () => {
    expect(trade_headroom_fraction("buy", 0)).toBe(1);
    expect(trade_headroom_fraction("buy", 0.7)).toBeCloseTo(0.3, 12);
    expect(trade_headroom_fraction("buy", 1)).toBe(0); // already own 100%
    expect(trade_headroom_fraction("sell", 0)).toBe(1); // can short up to 100%
    expect(trade_headroom_fraction("sell", -1)).toBe(0); // already 100% short
    expect(trade_headroom_fraction("buy", -0.5)).toBeCloseTo(1.5, 12); // cover short, then go long
  });

  it("cap_trade_fraction clamps the request to the available headroom", () => {
    expect(cap_trade_fraction("buy", 0, 0.5)).toBe(0.5); // fits
    expect(cap_trade_fraction("buy", 0.7, 0.5)).toBeCloseTo(0.3, 12); // trimmed to 100%
    expect(cap_trade_fraction("buy", 1, 0.2)).toBe(0); // no room
    expect(cap_trade_fraction("sell", 0, 1.5)).toBe(1); // short capped at 100%
    expect(cap_trade_fraction("sell", -1, 0.3)).toBe(0); // no room to short more
  });
});

describe("compute_quantity_from_pct", () => {
  it("a cheap player: a small portfolio % hits the 100% cap (the real bug)", () => {
    // €102M book, 10% budget = €10.2M, on a €0.8M player → you'd buy 12.75×
    // the whole player. Capped to 100%: 1.0 fraction = €0.8M cost.
    const { amount, shares, capped } = compute_quantity_from_pct(102, 10, 0.8, N, "buy", 0);
    expect(shares).toBe(MAX_OWNERSHIP_FRACTION);
    expect(amount).toBe(0.8);
    expect(capped).toBe(true);
  });

  it("an expensive player: the budget buys a sub-100% slice, no cap", () => {
    // €100M book, 10% budget = €10M, on a €200M player → 5% of the player.
    const { amount, shares, capped } = compute_quantity_from_pct(100, 10, 200, N, "buy", 0);
    expect(shares).toBeCloseTo(0.05, 12);
    expect(amount).toBe(10);
    expect(capped).toBe(false);
  });

  it("respects an existing holding's headroom", () => {
    // Already own 96% of the €200M player; 10% of €100M = €10M budget = 5% more,
    // but only 4% headroom remains → capped to 4% (€8M).
    const { amount, shares, capped } = compute_quantity_from_pct(100, 10, 200, N, "buy", 0.96);
    expect(shares).toBeCloseTo(0.04, 12);
    expect(amount).toBe(8);
    expect(capped).toBe(true);
  });

  it("zero total_value → zero shares (avoids div/0, no NaN)", () => {
    expect(compute_quantity_from_pct(1000, 25, 0, N, "buy", 0).shares).toBe(0);
  });
});

describe("compute_quantity_from_shares", () => {
  it("converts a displayed share count to a fraction and costs it", () => {
    const { amount, shares, capped } = compute_quantity_from_shares(50_000, 200, N, "buy", 0);
    expect(shares).toBeCloseTo(0.05, 12);
    expect(amount).toBe(10); // 0.05 × €200M
    expect(capped).toBe(false);
  });

  it("caps a request beyond the whole player", () => {
    const { shares, amount, capped } = compute_quantity_from_shares(2_000_000, 200, N, "buy", 0);
    expect(shares).toBe(1); // 2M shares requested, capped to N (=100%)
    expect(amount).toBe(200);
    expect(capped).toBe(true);
  });

  it("floors a fractional displayed share to the quantum (one whole share)", () => {
    const { shares } = compute_quantity_from_shares(50_000.7, 200, N, "buy", 0);
    expect(shares).toBeCloseTo(0.05, 12); // 50000.7 → 50000 shares
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
    expect(compute_short_quantity("buy", 0.6, 0.2)).toBe(0);
  });
  it("zero when selling within the held quantity", () => {
    expect(compute_short_quantity("sell", 0.3, 0.5)).toBe(0);
    expect(compute_short_quantity("sell", 0.5, 0.5)).toBe(0);
  });
  it("returns the over-sold fraction (beyond the held long)", () => {
    expect(compute_short_quantity("sell", 0.8, 0.5)).toBeCloseTo(0.3, 12);
  });
});

describe("compute_shares_after", () => {
  it("buy adds shares", () => {
    expect(compute_shares_after("buy", 0.5, 0.3)).toBeCloseTo(0.8, 12);
  });
  it("sell subtracts shares — can go negative (opens a short)", () => {
    expect(compute_shares_after("sell", 0.5, 0.8)).toBeCloseTo(-0.3, 12);
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
    expect(compute_realized_pnl("buy", 0.5, 10, 8, 0.5)).toBe(0);
  });
  it("zero when there are no held shares to close", () => {
    expect(compute_realized_pnl("sell", 0.5, 10, 8, 0)).toBe(0);
  });
  it("(current_price - avg_buy) × closing_shares (capped at held)", () => {
    // sell 0.3 of a 0.5 long, avg 6, price 10 → (10−6)×0.3
    expect(compute_realized_pnl("sell", 0.3, 10, 6, 0.5)).toBeCloseTo(1.2, 12);
  });
  it("caps closing_shares at the held quantity (the extra opens a short)", () => {
    expect(compute_realized_pnl("sell", 0.8, 10, 6, 0.5)).toBeCloseTo(2, 12); // only 0.5 closes
  });
});

describe("compute_buy_shortfall", () => {
  it("no shortfall on a sell", () => {
    expect(compute_buy_shortfall("sell", 1000, 100)).toEqual({ insufficient: false, shortfall: 0 });
  });
  it("no shortfall when buy fits cash", () => {
    expect(compute_buy_shortfall("buy", 50, 100)).toEqual({ insufficient: false, shortfall: 0 });
  });
  it("returns the missing amount when buy exceeds cash", () => {
    expect(compute_buy_shortfall("buy", 150, 100)).toEqual({ insufficient: true, shortfall: 50 });
  });
});
