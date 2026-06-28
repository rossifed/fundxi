import { describe, expect, it } from "vitest";
import { build_bracket } from "./bracket";
import type { Fixture } from "./fixture";

const fx = (id: number, stage: string, home: string, away: string, date?: string): Fixture => ({
  id,
  home_team_id: home,
  away_team_id: away,
  status: "finished",
  group: "",
  stage_name: stage,
  date,
});

// A full, deterministic knockout tree. In every match the HOME team advances,
// so "winner = the team that appears in the next round" resolves cleanly.
//
//   left half          right half
//   RL1(L)  RL2(QLA) -> QFLa(L)   \        / QFRa(R)  <- RR1(R)  RR2(QRA)
//   RL3(SLB) RL4(QLB)-> QFLb(SLB)  > SL(L)..SR(R) <    QFRb(SRB) <- RR3 RR4
//                         \-> SL(L) -> Final(L vs R) <- SR(R) <-/
const R16 = "Round of 16";
const QF = "Quarter-finals";
const SF = "Semi-finals";

const RL1 = fx(1, R16, "L", "la1", "2026-07-01");
const RL2 = fx(2, R16, "QLA", "la2", "2026-07-02");
const RL3 = fx(3, R16, "SLB", "la3", "2026-07-03");
const RL4 = fx(4, R16, "QLB", "la4", "2026-07-04");
const RR1 = fx(5, R16, "R", "ra1", "2026-07-05");
const RR2 = fx(6, R16, "QRA", "ra2", "2026-07-06");
const RR3 = fx(7, R16, "SRB", "ra3", "2026-07-07");
const RR4 = fx(8, R16, "QRB", "ra4", "2026-07-08");
const QFLa = fx(9, QF, "L", "QLA", "2026-07-10");
const QFLb = fx(10, QF, "SLB", "QLB", "2026-07-11");
const QFRa = fx(11, QF, "R", "QRA", "2026-07-12");
const QFRb = fx(12, QF, "SRB", "QRB", "2026-07-13");
const SL = fx(13, SF, "L", "SLB", "2026-07-15");
const SR = fx(14, SF, "R", "SRB", "2026-07-16");
const FINAL = fx(15, "Final", "L", "R", "2026-07-18");
const THIRD = fx(16, "3rd Place Final", "SLB", "SRB", "2026-07-17");

const ALL = [RL1, RL2, RL3, RL4, RR1, RR2, RR3, RR4, QFLa, QFLb, QFRa, QFRb, SL, SR, FINAL, THIRD];
const id = (f: Fixture | null) => f?.id ?? null;

describe("build_bracket — full tournament", () => {
  // Shuffled input proves placement comes from the advancement tree, not order.
  const b = build_bracket([...ALL].reverse());

  it("places the final and the third-place match", () => {
    expect(id(b.final)).toBe(FINAL.id);
    expect(id(b.third_place)).toBe(THIRD.id);
  });

  it("assigns each semi-final to the side of the finalist it produced", () => {
    expect(id(b.sf_left)).toBe(SL.id); // winner L == final.home
    expect(id(b.sf_right)).toBe(SR.id); // winner R == final.away
  });

  it("groups the quarter-finals under their semi-final, ordered by kickoff", () => {
    expect(b.qf_left.map(id)).toEqual([QFLa.id, QFLb.id]);
    expect(b.qf_right.map(id)).toEqual([QFRa.id, QFRb.id]);
  });

  it("nests the round-of-16 under the right quarter-final, ordered by kickoff", () => {
    expect(b.r16_left.map(id)).toEqual([RL1.id, RL2.id, RL3.id, RL4.id]);
    expect(b.r16_right.map(id)).toEqual([RR1.id, RR2.id, RR3.id, RR4.id]);
  });

  it("keeps the left and right halves disjoint", () => {
    const left = new Set(b.r16_left.map(id));
    expect(b.r16_right.every(f => !left.has(id(f)))).toBe(true);
  });

  it("leaves the Round of 32 empty for a 32-team tournament (no R32 fixtures)", () => {
    expect(b.r32_left).toEqual([null, null, null, null, null, null, null, null]);
    expect(b.r32_right).toEqual([null, null, null, null, null, null, null, null]);
  });
});

describe("build_bracket — 48-team format (Round of 32)", () => {
  // 8 R32 matches feeding the 4 left-half R16 matches (2 each). The winner of
  // each feeds the team it faces in R16, so the walk nests them under R16-left.
  const R32 = "Round of 32";
  const e1 = fx(101, R32, "L", "z1", "2026-06-25"); //   → RL1 (L)
  const e2 = fx(102, R32, "la1", "z2", "2026-06-26"); // → RL1 (la1)
  const e3 = fx(103, R32, "QLA", "z3", "2026-06-25"); // → RL2 (QLA)
  const e4 = fx(104, R32, "la2", "z4", "2026-06-26"); // → RL2 (la2)
  const e5 = fx(105, R32, "SLB", "z5", "2026-06-25"); // → RL3 (SLB)
  const e6 = fx(106, R32, "la3", "z6", "2026-06-26"); // → RL3 (la3)
  const e7 = fx(107, R32, "QLB", "z7", "2026-06-25"); // → RL4 (QLB)
  const e8 = fx(108, R32, "la4", "z8", "2026-06-26"); // → RL4 (la4)
  const b = build_bracket([...ALL, e8, e1, e5, e3, e7, e2, e6, e4]); // shuffled

  it("nests each R32 pair under its R16 match, ordered by kickoff", () => {
    expect(b.r32_left.map(id)).toEqual([101, 102, 103, 104, 105, 106, 107, 108]);
  });

  it("keeps fixed-size R32 sides; the unfed (right) side stays all-null", () => {
    expect(b.r32_left).toHaveLength(8);
    expect(b.r32_right).toEqual([null, null, null, null, null, null, null, null]);
  });
});

describe("build_bracket — deepest round has no downstream yet", () => {
  const R32 = "Round of 32";
  // 16 R32 matches played, R16 not yet drawn (prod WC2026 state right after the
  // group stage). Nothing downstream to anchor to → must fall back to a
  // sequential fill so the matches still render instead of an empty column.
  const r32s = Array.from({ length: 16 }, (_, i) =>
    fx(200 + i, R32, `h${i}`, `a${i}`, `2026-06-${(20 + i).toString().padStart(2, "0")}`),
  );

  it("lays the 16 R32 matches across both sides (8 + 8) by kickoff order", () => {
    const b = build_bracket([...r32s].reverse()); // shuffled input
    expect(b.r32_left.map(id)).toEqual([200, 201, 202, 203, 204, 205, 206, 207]);
    expect(b.r32_right.map(id)).toEqual([208, 209, 210, 211, 212, 213, 214, 215]);
  });

  it("falls back for the R16 too when it is the deepest round (no QF yet)", () => {
    const r16s = Array.from({ length: 8 }, (_, i) => fx(300 + i, "Round of 16", `x${i}`, `y${i}`, `2026-07-0${i}`));
    const b = build_bracket(r16s);
    expect(b.r16_left.map(id)).toEqual([300, 301, 302, 303]);
    expect(b.r16_right.map(id)).toEqual([304, 305, 306, 307]);
  });
});

describe("build_bracket — partial / empty inputs", () => {
  it("returns an all-empty SKELETON for no fixtures (fixed-size rounds, padded with nulls)", () => {
    const b = build_bracket([]);
    expect(b.final).toBeNull();
    expect(b.third_place).toBeNull();
    expect(b.sf_left).toBeNull();
    expect(b.sf_right).toBeNull();
    expect(b.qf_left).toEqual([null, null]);
    expect(b.r16_left).toEqual([null, null, null, null]);
    expect(b.r16_right).toEqual([null, null, null, null]);
    // 48-team format first round: 8 slots per side, all null (skeleton).
    expect(b.r32_left).toEqual([null, null, null, null, null, null, null, null]);
    expect(b.r32_right).toEqual([null, null, null, null, null, null, null, null]);
  });

  it("falls back to kickoff order for the semis when there is no final yet", () => {
    // Semis played, final not yet created → no finalist to anchor the sides.
    const b = build_bracket([SR, SL]); // reversed on purpose
    expect(id(b.sf_left)).toBe(SL.id); // earliest kickoff first
    expect(id(b.sf_right)).toBe(SR.id);
    expect(b.final).toBeNull();
  });
});

describe("build_bracket — undated fixtures", () => {
  it("does not drop fixtures that lack a kickoff date", () => {
    const a = fx(20, "Semi-finals", "X", "Y"); // no date
    const c = fx(21, "Semi-finals", "Z", "W"); // no date
    const b = build_bracket([a, c]);
    const seen = new Set([id(b.sf_left), id(b.sf_right)]);
    expect(seen).toEqual(new Set([20, 21]));
  });
});
