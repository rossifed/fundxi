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
    expect(totals.return_pct).toBeCloseTo((14 / 36) * 100, 6);
  });

  it("ignores holdings with no price quote available", () => {
    const prices = new Map([[1, 10]]); // player 2 missing
    const totals = compute_portfolio_totals([h(1, 5, 5), h(2, 3, 3)], prices, 0);
    expect(totals.market_value).toBe(50);
    expect(totals.total_cost).toBe(25); // only h(1) counted
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
