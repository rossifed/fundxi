import { describe, expect, it } from "vitest";
import { compute_period_return, compute_return_pct } from "./return";

describe("compute_return_pct", () => {
  it("standard positive return", () => {
    expect(compute_return_pct(120, 100)).toBe(20);
  });
  it("standard negative return", () => {
    expect(compute_return_pct(80, 100)).toBe(-20);
  });
  it("returns 0 when base is 0 (avoid div/0)", () => {
    expect(compute_return_pct(50, 0)).toBe(0);
  });
});

describe("compute_period_return", () => {
  it("returns first→last % change", () => {
    expect(compute_period_return([100, 120, 110, 130])).toBe(30);
  });
  it("returns 0 on empty history", () => {
    expect(compute_period_return([])).toBe(0);
  });
  it("returns 0 on single-point history", () => {
    expect(compute_period_return([100])).toBe(0);
  });
});
