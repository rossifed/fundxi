import { describe, expect, it } from "vitest";
import { compute_basket, type BasketPlayerInput } from "./basket_calc";

const N = 1_000_000; // shares/player display denomination

const players = (specs: [number, number, number][]): BasketPlayerInput[] =>
  specs.map(([player_id, total_value, held_fraction]) => ({ player_id, total_value, held_fraction }));

describe("compute_basket — equal weighting", () => {
  it("splits the budget evenly and sizes each leg as a normal buy", () => {
    // €30M budget across 3 players of €100M each → €10M each = 0.1 of each.
    const plan = compute_basket(30, players([[1, 100, 0], [2, 100, 0], [3, 100, 0]]), "equal", N);
    expect(plan.lines.map(l => l.shares)).toEqual([0.1, 0.1, 0.1]);
    expect(plan.lines.map(l => l.amount)).toEqual([10, 10, 10]);
    expect(plan.total_amount).toBe(30);
  });

  it("caps a leg at the player's whole value and at remaining headroom", () => {
    // €40M each-leg budget on a €10M player → would be 4× the player; capped to
    // the 0.2 headroom left (already holds 0.8) → €2M leg.
    const plan = compute_basket(80, players([[1, 10, 0.8], [2, 100, 0]]), "equal", N);
    // leg 1 budget €40M, capped to 0.2 (€2M); leg 2 €40M on €100M → 0.4 (€40M).
    expect(plan.lines[0].shares).toBeCloseTo(0.2, 12);
    expect(plan.lines[0].capped).toBe(true);
    expect(plan.lines[0].amount).toBe(2);
    expect(plan.lines[1].shares).toBeCloseTo(0.4, 12);
    expect(plan.total_amount).toBe(42); // < 80 budget: capped leg leaves a residual
  });
});

describe("compute_basket — market_value weighting", () => {
  it("allocates proportionally to each player's whole value", () => {
    // €30M budget; values 100 and 200 → weights 1/3 and 2/3 → €10M and €20M.
    const plan = compute_basket(30, players([[1, 100, 0], [2, 200, 0]]), "market_value", N);
    expect(plan.lines[0].amount).toBe(10); // €10M / €100M = 0.1
    expect(plan.lines[0].shares).toBeCloseTo(0.1, 12);
    expect(plan.lines[1].amount).toBe(20); // €20M / €200M = 0.1
    expect(plan.lines[1].shares).toBeCloseTo(0.1, 12);
    expect(plan.total_amount).toBe(30);
  });

  it("falls back to an equal split when no player has a positive value", () => {
    const plan = compute_basket(20, players([[1, 0, 0], [2, 0, 0]]), "market_value", N);
    // total_value 0 everywhere → 0 shares (div/0 guard), equal weights applied.
    expect(plan.lines.every(l => l.shares === 0)).toBe(true);
    expect(plan.total_amount).toBe(0);
  });
});

describe("compute_basket — edge cases", () => {
  it("empty selection → empty plan", () => {
    const plan = compute_basket(50, [], "equal", N);
    expect(plan.lines).toEqual([]);
    expect(plan.total_amount).toBe(0);
  });

  it("zero budget → every leg is zero", () => {
    const plan = compute_basket(0, players([[1, 100, 0], [2, 50, 0]]), "equal", N);
    expect(plan.lines.every(l => l.shares === 0 && l.amount === 0)).toBe(true);
    expect(plan.total_amount).toBe(0);
  });

  it("never spends more than the budget", () => {
    const plan = compute_basket(15, players([[1, 100, 0], [2, 7, 0], [3, 250, 0]]), "equal", N);
    expect(plan.total_amount).toBeLessThanOrEqual(15 + 1e-9);
  });
});
