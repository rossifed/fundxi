import { describe, expect, it } from "vitest";

import { compute_spark_geometry } from "./spark";

describe("compute_spark_geometry", () => {
  it("returns an empty polyline and a flat baseline for empty data", () => {
    const g = compute_spark_geometry([], 60, 20);
    expect(g.points).toBe("");
    expect(g.filled_points).toBe("0,20 60,20");
    expect(g.is_up).toBe(true);
  });

  it("centers a single-point series and treats it as up", () => {
    const g = compute_spark_geometry([5], 60, 20);
    expect(g.points).toBe("30,10");
    expect(g.is_up).toBe(true);
  });

  it("maps values onto width/height with the high point at y=0 and the low at y=height", () => {
    const g = compute_spark_geometry([0, 5, 10], 100, 50);
    expect(g.points).toBe("0,50 50,25 100,0");
    expect(g.is_up).toBe(true);
  });

  it("flags a downtrend when the last value is below the first", () => {
    const g = compute_spark_geometry([10, 5, 0], 100, 50);
    expect(g.points).toBe("0,0 50,25 100,50");
    expect(g.is_up).toBe(false);
  });

  it("closes the filled polygon down to the baseline on both ends", () => {
    const g = compute_spark_geometry([1, 2, 1], 40, 10);
    // Baseline anchors at (0, height) and (width, height) sandwich the path.
    expect(g.filled_points.startsWith("0,10 ")).toBe(true);
    expect(g.filled_points.endsWith(" 40,10")).toBe(true);
  });

  it("survives a flat series (range collapses to 1 internally)", () => {
    const g = compute_spark_geometry([3, 3, 3, 3], 30, 10);
    // All points sit at the top because range collapses to 1 and
    // (value - min) / range = 0 → y = height - 0 = height.
    expect(g.points).toBe("0,10 10,10 20,10 30,10");
    expect(g.is_up).toBe(true);
  });
});
