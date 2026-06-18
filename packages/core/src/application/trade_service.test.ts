import { beforeEach, describe, expect, it } from "vitest";
import { simulate_trade, type TradePreview } from "./trade_service";
import { _set_from_outcome } from "@fundxi/core/infrastructure/repositories/portfolio_repository";
import { set_shares_per_player } from "@fundxi/core/infrastructure/runtime_config";
import type { Player } from "@fundxi/core/domain/player/player";

// These tests verify the ORCHESTRATION wiring of simulate_trade (which service
// value feeds which trade_calc argument), not the formulas themselves —
// trade_calc is unit-tested in isolation. Inputs are chosen so every output
// field has a unique value a swapped argument would change.
//
// Denomination: N = 10 shares/player here, so a displayed share count maps to a
// clean ownership fraction (5 shares = 0.5 = half the player). The canonical
// quantity in the preview (`shares`) is the fraction; `display_shares` is ×N.
//
// State: cash 100 + a holding of fraction 0.5 @ €8 cost. No valuation is seeded,
// so get_my_totals marks the holding at cost → total_value = 100 + 0.5×8 = 104.

const player: Player = { id: 1, name: "P1", jersey_number: 9, team_id: "ARG", position: "FW" };

beforeEach(() => {
  set_shares_per_player(10);
  _set_from_outcome({
    id: 1,
    user_id: 1,
    cash: 100,
    holdings: [{ player_id: 1, shares: 0.5, average_buy_price: 8 }],
  });
});

describe("simulate_trade — buy by shares", () => {
  let p: TradePreview;
  beforeEach(() => {
    // 3 displayed shares = 0.3 of the player; €10M whole value → €3M cost.
    p = simulate_trade({ player, kind: "buy", mode: "shares", shares: 3, current_price: 10 });
  });

  it("converts displayed shares to a fraction and costs it at the override price", () => {
    expect(p.shares).toBeCloseTo(0.3, 12);
    expect(p.display_shares).toBeCloseTo(3, 9);
    expect(p.amount).toBe(3);
    expect(p.price_per_share).toBeCloseTo(1, 12); // €10M / 10
  });
  it("adds to the position and debits cash", () => {
    expect(p.held_shares).toBeCloseTo(0.5, 12);
    expect(p.shares_after).toBeCloseTo(0.8, 12);
    expect(p.pct_of_player_after).toBeCloseTo(80, 9);
    expect(p.cash_before).toBe(100);
    expect(p.cash_after).toBe(97);
  });
  it("has no realized P&L, is affordable and not capped", () => {
    expect(p.realized_pnl).toBe(0);
    expect(p.insufficient_capital).toBe(false);
    expect(p.capped).toBe(false);
  });
  it("computes the share of the portfolio against total_value (3/104)", () => {
    expect(p.percentage_of_portfolio).toBe(3); // round(3/104*100)
  });
});

describe("simulate_trade — sell beyond the holding is capped (long-only, no short)", () => {
  let p: TradePreview;
  beforeEach(() => {
    // sell 8 displayed shares = 0.8 requested, but only 0.5 is held → trimmed to
    // the whole holding (long-only: a sell can never open a short).
    p = simulate_trade({ player, kind: "sell", mode: "shares", shares: 8, current_price: 10 });
  });

  it("trims the sell to the held long — never a short", () => {
    expect(p.shares).toBeCloseTo(0.5, 12); // capped to the holding
    expect(p.shares_after).toBeCloseTo(0, 12); // position fully closed
    expect(p.pct_of_player_after).toBeCloseTo(0, 9);
    expect(p.capped).toBe(true);
  });
  it("credits cash for the trimmed sell only", () => {
    expect(p.cash_after).toBe(105); // 100 + 0.5×10 (not 0.8×10)
  });
  it("realizes P&L on the closed holding", () => {
    // closing 0.5 held at €10 vs €8 cost = +1.
    expect(p.realized_pnl).toBeCloseTo(1, 12);
  });
});

describe("simulate_trade — percentage mode", () => {
  it("uses the percentage branch (10% of €100 cash on a €100M player → 0.1, €10M)", () => {
    const p = simulate_trade({ player, kind: "buy", mode: "percentage", percentage: 10, current_price: 100 });
    // A swapped branch would read input.shares (undefined → 0) and yield 0.
    expect(p.shares).toBeCloseTo(0.1, 12);
    expect(p.amount).toBe(10);
    expect(p.shares_after).toBeCloseTo(0.6, 12);
    expect(p.cash_after).toBe(90);
    expect(p.percentage_of_portfolio).toBe(10);
    expect(p.capped).toBe(false);
  });
});

describe("simulate_trade — the player-value cap bites", () => {
  it("a large % on a cheap player is clamped to 100% of the player", () => {
    // 50% of €100 cash = €50M budget on a €10M player → would be 5× the player.
    // Held 0.5 already, so only 0.5 headroom remains → capped to the whole player.
    const p = simulate_trade({ player, kind: "buy", mode: "percentage", percentage: 50, current_price: 10 });
    expect(p.capped).toBe(true);
    expect(p.shares).toBeCloseTo(0.5, 12); // headroom to 100%
    expect(p.shares_after).toBeCloseTo(1, 12);
    expect(p.pct_of_player_after).toBeCloseTo(100, 9);
    expect(p.amount).toBe(5); // 0.5 × €10M
    expect(p.max_trade_display_shares).toBeCloseTo(5, 9); // 0.5 headroom × N=10
  });
});

describe("simulate_trade — insufficient capital on a buy", () => {
  it("reports the shortfall when the (uncapped) amount exceeds cash", () => {
    // €1000M player, held 0.5 (0.5 headroom). Buy 5 shares = 0.5 → €500M > €100M cash.
    const p = simulate_trade({ player, kind: "buy", mode: "shares", shares: 5, current_price: 1000 });
    expect(p.capped).toBe(false);
    expect(p.amount).toBe(500);
    expect(p.insufficient_capital).toBe(true);
    expect(p.shortfall).toBe(400);
  });
});

describe("simulate_trade — no holding for the player", () => {
  it("a sell with nothing held is trimmed to zero (long-only: no short)", () => {
    const other: Player = { ...player, id: 999 };
    const p = simulate_trade({ player: other, kind: "sell", mode: "shares", shares: 2, current_price: 10 });
    expect(p.held_shares).toBe(0);
    expect(p.shares).toBe(0); // nothing to sell, no short opened
    expect(p.realized_pnl).toBe(0);
  });
});
