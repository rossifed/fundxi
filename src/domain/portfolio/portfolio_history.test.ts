import { describe, expect, it } from "vitest";
import { compute_portfolio_history } from "./portfolio_history";
import type { Holding } from "./holding";

const h = (player_id: number, shares: number): Holding => ({
  player_id,
  shares,
  average_buy_price: 1, // not used by history
});

describe("compute_portfolio_history", () => {
  it("returns cash baseline when no holdings", () => {
    const hist = compute_portfolio_history([], 100, () => [1, 2, 3], 4);
    expect(hist).toEqual([100, 100, 100, 100]);
  });

  it("adds shares × sparkline at each timestep", () => {
    const spark = (_id: number): number[] => [10, 20, 30];
    const hist = compute_portfolio_history([h(1, 5)], 0, spark, 3);
    expect(hist).toEqual([50, 100, 150]);
  });

  it("aggregates across multiple holdings", () => {
    const spark = (id: number): number[] => (id === 1 ? [10, 20] : [5, 8]);
    const hist = compute_portfolio_history([h(1, 2), h(2, 3)], 50, spark, 2);
    expect(hist).toEqual([50 + 2 * 10 + 3 * 5, 50 + 2 * 20 + 3 * 8]);
  });

  it("shorts subtract: negative shares × positive price gives negative contribution", () => {
    const spark = (_id: number): number[] => [10, 12];
    const hist = compute_portfolio_history([h(1, -5)], 100, spark, 2);
    expect(hist).toEqual([100 - 5 * 10, 100 - 5 * 12]);
  });

  it("skips holdings with empty sparklines (player not yet priced)", () => {
    const spark = (id: number): number[] => (id === 1 ? [10, 20] : []);
    const hist = compute_portfolio_history([h(1, 5), h(2, 100)], 0, spark, 2);
    expect(hist).toEqual([50, 100]); // h(2) contributes nothing
  });

  it("resamples when sparkline length < requested length", () => {
    // 2-pt sparkline, ask for 4 points — should map proportionally
    const spark = (_id: number): number[] => [10, 100];
    const hist = compute_portfolio_history([h(1, 1)], 0, spark, 4);
    // i=0 → idx 0 → 10; i=3 → idx 1 → 100
    expect(hist[0]).toBe(10);
    expect(hist[3]).toBe(100);
  });
});
