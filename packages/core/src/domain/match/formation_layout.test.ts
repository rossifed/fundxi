import { describe, expect, it } from "vitest";
import { compute_pitch_positions } from "./formation_layout";
import type { MatchPlayer } from "./match";
import type { Position } from "../player/player";

const mp = (id: number, position: Position, jersey: number, formation_field?: string): MatchPlayer => ({
  id,
  name: `P${id}`,
  jersey_number: jersey,
  position,
  value: 1,
  rating: 7,
  formation_field,
});

const by_id = (out: { player: MatchPlayer; x: number; y: number }[]) =>
  new Map(out.map(p => [p.player.id, p]));

// Expected coordinates are derived by hand from the documented constants
// (Y_GK_NEAR=87, Y_LAST single=14 / dual=52, X_MARGIN=8, X_USABLE=84), not
// copied from the implementation.

describe("compute_pitch_positions — Sportmonks grid strategy", () => {
  it("single-team home view mirrors columns so col 1 lands on screen-right", () => {
    const xi = [
      mp(1, "GK", 1, "1:1"),
      mp(2, "DF", 2, "2:1"),
      mp(3, "DF", 3, "2:2"),
      mp(4, "DF", 4, "2:3"),
      mp(5, "DF", 5, "2:4"),
    ];
    const out = by_id(compute_pitch_positions(xi, "4-3-3", "home", { single_team: true }));

    // GK: row 1 → y=87, single column → centred.
    expect(out.get(1)!.x).toBeCloseTo(50, 5);
    expect(out.get(1)!.y).toBeCloseTo(87, 5);

    // Back four: row 2 of 2 → t=1 → y=14 (single-team forwards reach far box).
    // ncols=4, raw_x_frac=(col-0.5)/4, mirrored (1-frac) for home single view.
    expect(out.get(2)!.y).toBeCloseTo(14, 5);
    expect(out.get(2)!.x).toBeCloseTo(81.5, 5); // col 1 → right
    expect(out.get(3)!.x).toBeCloseTo(60.5, 5);
    expect(out.get(4)!.x).toBeCloseTo(39.5, 5);
    expect(out.get(5)!.x).toBeCloseTo(18.5, 5); // col 4 → left
  });

  it("away dual-team view keeps raw orientation and flips to the far half", () => {
    const xi = [mp(1, "GK", 1, "1:1"), mp(2, "DF", 2, "2:1"), mp(5, "DF", 5, "2:4")];
    const out = by_id(compute_pitch_positions(xi, "4-3-3", "away", { single_team: false }));

    // Away in shared layout: y = 100 - near_y. GK near_y=87 → y=13.
    expect(out.get(1)!.y).toBeCloseTo(13, 5);
    // Row 2 of 2, dual y_last=52 → near_y=52 → y=48.
    expect(out.get(2)!.y).toBeCloseTo(48, 5);
    // Not mirrored: col 1 → left (18.5), col 4 → right (81.5).
    expect(out.get(2)!.x).toBeCloseTo(18.5, 5);
    expect(out.get(5)!.x).toBeCloseTo(81.5, 5);
  });

  it("places every starter exactly once", () => {
    const xi = [mp(1, "GK", 1, "1:1"), mp(2, "DF", 2, "2:1"), mp(3, "DF", 3, "2:2")];
    const out = compute_pitch_positions(xi, "4-3-3", "home", { single_team: true });
    expect(out).toHaveLength(3);
    expect(new Set(out.map(p => p.player.id)).size).toBe(3);
  });
});

describe("compute_pitch_positions — formation-string fallback", () => {
  // 4-3-3, all without formation_field → grid strategy returns null, falls back.
  const xi: MatchPlayer[] = [
    mp(1, "GK", 1),
    mp(2, "DF", 2),
    mp(3, "DF", 3),
    mp(4, "DF", 4),
    mp(5, "DF", 5),
    mp(6, "MF", 6),
    mp(7, "MF", 7),
    mp(8, "MF", 8),
    mp(9, "FW", 9),
    mp(10, "FW", 10),
    mp(11, "FW", 11),
  ];

  it("distributes the XI by position group across the formation rows", () => {
    const out = by_id(compute_pitch_positions(xi, "4-3-3", "home", { single_team: true }));

    // y_for_row(r): near_y = 87 - 73*(r-1)/3 (max_row = 3 outfield + GK = 4).
    expect(out.get(1)!.y).toBeCloseTo(87, 5); // GK, row 1
    expect(out.get(2)!.y).toBeCloseTo(62.667, 2); // DF, row 2
    expect(out.get(6)!.y).toBeCloseTo(38.333, 2); // MF, row 3
    expect(out.get(9)!.y).toBeCloseTo(14, 5); // FW, row 4 (last)

    // DF row: row_x(i, 4) = 8 + ((i+0.5)/4)*84 → first DF (lowest jersey) left.
    expect(out.get(2)!.x).toBeCloseTo(18.5, 5);
    expect(out.get(5)!.x).toBeCloseTo(81.5, 5);
    // MF row of 3: centre slot at x=50.
    expect(out.get(7)!.x).toBeCloseTo(50, 5);
  });

  it("uses the players' jersey order within a position group", () => {
    // Shuffle the DFs; placement must still go by jersey ascending.
    const shuffled = [mp(1, "GK", 1), mp(5, "DF", 5), mp(2, "DF", 2), mp(4, "DF", 4), mp(3, "DF", 3)];
    const out = by_id(compute_pitch_positions(shuffled, "4-3-3", "home", { single_team: true }));
    expect(out.get(2)!.x).toBeCloseTo(18.5, 5); // jersey 2 → leftmost
    expect(out.get(5)!.x).toBeCloseTo(81.5, 5); // jersey 5 → rightmost
  });

  it("an invalid formation string defaults to 4-3-3 distribution", () => {
    const out = by_id(compute_pitch_positions(xi, "4-4-3", "home", { single_team: true })); // sum 11 → invalid
    // Same as 4-3-3: 4 defenders → first at 18.5, last at 81.5.
    expect(out.get(2)!.x).toBeCloseTo(18.5, 5);
    expect(out.get(5)!.x).toBeCloseTo(81.5, 5);
  });

  it("places leftover players (count > formation) in front of the keeper", () => {
    // 5 DFs but 4-3-3 only seats 4 → the 5th is a straggler.
    const five_df = [
      mp(1, "GK", 1),
      mp(2, "DF", 2),
      mp(3, "DF", 3),
      mp(4, "DF", 4),
      mp(5, "DF", 5),
      mp(6, "DF", 6), // overflow
      mp(7, "MF", 7),
      mp(8, "MF", 8),
      mp(9, "MF", 9),
      mp(10, "FW", 10),
      mp(11, "FW", 11),
      mp(12, "FW", 12),
    ];
    const out = by_id(compute_pitch_positions(five_df, "4-3-3", "home", { single_team: true }));
    expect(out.size).toBe(12); // nobody dropped
    // fallback_y = (y_for_row(1)+y_for_row(2))/2 = (87 + 62.667)/2.
    expect(out.get(6)!.y).toBeCloseTo((87 + 62.667) / 2, 2);
  });
});

describe("compute_pitch_positions — strategy selection", () => {
  it("falls back to the formation string when any starter lacks a grid cell", () => {
    // GK + DF1 carry cells; DF2 does not → grid returns null, fallback used.
    const xi = [mp(1, "GK", 1, "1:1"), mp(2, "DF", 2, "2:1"), mp(3, "DF", 3)];
    const out = by_id(compute_pitch_positions(xi, "4-3-3", "home", { single_team: true }));
    // Grid (home single) would mirror DF jersey-2 (col 1) to x≈81.5; the
    // fallback instead seats the first defender at the left (≈18.5).
    expect(out.get(2)!.x).toBeCloseTo(18.5, 5);
  });
});
