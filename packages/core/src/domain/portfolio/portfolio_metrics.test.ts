import { describe, expect, it } from "vitest";
import {
  compute_holding_metrics,
  compute_portfolio_share,
  compute_portfolio_totals,
} from "./portfolio_metrics";
import type { Holding } from "./holding";

const h = (player_id: number, shares: number, avg: number): Holding => ({
  player_id,
  shares,
  average_buy_price: avg,
});

describe("compute_holding_metrics", () => {
  it("derives market_value, cost_basis, pnl, return_pct", () => {
    const m = compute_holding_metrics(h(1, 10, 5), 7);
    expect(m.market_value).toBe(70);
    expect(m.cost_basis).toBe(50);
    expect(m.pnl).toBe(20);
    expect(m.return_pct).toBe(40); // (20/50)*100
  });

  it("returns 0 return_pct when cost_basis is 0 (free position)", () => {
    const m = compute_holding_metrics(h(1, 5, 0), 10);
    expect(m.cost_basis).toBe(0);
    expect(m.pnl).toBe(50);
    expect(m.return_pct).toBe(0);
  });

  it("handles short positions (negative shares ⇒ negative market_value)", () => {
    const m = compute_holding_metrics(h(1, -10, 5), 7);
    expect(m.market_value).toBe(-70);
    expect(m.cost_basis).toBe(-50);
    expect(m.pnl).toBe(-20); // price went up against the short
    expect(m.return_pct).toBe(-40); // loss → negative (pnl / |cost_basis|)
  });

  it("a winning short shows a POSITIVE return (sign tracks P&L, not shares)", () => {
    // Short 10 @ 5, price falls to 3 → the short gained.
    const m = compute_holding_metrics(h(1, -10, 5), 3);
    expect(m.cost_basis).toBe(-50);
    expect(m.pnl).toBe(20); // (3-5)×-10
    expect(m.return_pct).toBe(40); // 20 / |−50| — POSITIVE, not −40
  });
});

describe("compute_portfolio_totals", () => {
  it("sums market_value across holdings and adds cash", () => {
    const prices = new Map([[1, 10], [2, 5]]);
    const totals = compute_portfolio_totals([h(1, 3, 8), h(2, 4, 3)], prices, 100);
    expect(totals.market_value).toBe(3 * 10 + 4 * 5); // 50
    expect(totals.cash).toBe(100);
    expect(totals.total_value).toBe(150);
    expect(totals.total_cost).toBe(3 * 8 + 4 * 3); // 36
    expect(totals.pnl).toBe(14);
    // return = pnl / (cash + total_cost) = 14 / (100 + 36)
    expect(totals.return_pct).toBeCloseTo((14 / 136) * 100, 6);
  });

  it("long + short of similar cost: return stays sane (no near-zero denominator blow-up)", () => {
    // Regression: a long ~10% and a short ~10% net total_cost to ~0. Dividing
    // P&L by that exploded the return (bogus +32% on an essentially flat book).
    // Dividing by the capital base (cash + total_cost ≈ opening AUM) keeps it sane.
    const prices = new Map([[1, 10.2], [2, 9.8]]); // both moved ~2% from cost 10
    const long = h(1, 10, 10); // +100 cost
    const short = h(2, -10, 10); // −100 cost ⇒ total_cost ≈ 0
    const totals = compute_portfolio_totals([long, short], prices, 100);
    expect(totals.total_cost).toBeCloseTo(0, 6);
    // long +2 pnl, short +2 pnl (price fell below cost) ⇒ pnl ≈ 4 on a 100 base
    expect(totals.pnl).toBeCloseTo(4, 6);
    expect(totals.return_pct).toBeCloseTo((4 / 100) * 100, 6); // ~4%, not hundreds
    expect(Math.abs(totals.return_pct)).toBeLessThan(100);
  });

  it("marks holdings with no price quote at cost basis (flat, P&L 0) — not dropped", () => {
    // Coherence: a missing price must be handled identically here and in
    // get_my_holdings_with_metrics + the backend snapshot service — all mark
    // at cost basis (flat) rather than one dropping and another zeroing it.
    const prices = new Map([[1, 10]]); // player 2 missing
    const totals = compute_portfolio_totals([h(1, 5, 5), h(2, 3, 3)], prices, 0);
    // h1: 5×10 mkt / 5×5 cost. h2 (no price): marked at cost 3 → 3×3 both.
    expect(totals.market_value).toBe(50 + 9);
    expect(totals.total_cost).toBe(25 + 9);
    expect(totals.pnl).toBe(25); // only h1 contributes P&L; h2 is flat
  });

  it("empty portfolio: total_value = cash, no division by zero", () => {
    const totals = compute_portfolio_totals([], new Map(), 100);
    expect(totals.total_value).toBe(100);
    expect(totals.pnl).toBe(0);
    expect(totals.return_pct).toBe(0);
  });
});

describe("compute_portfolio_share", () => {
  it("returns the percentage of the position vs the portfolio", () => {
    expect(compute_portfolio_share(25, 100)).toBe(25);
  });

  it("guards divide-by-zero", () => {
    expect(compute_portfolio_share(50, 0)).toBe(0);
  });
});
