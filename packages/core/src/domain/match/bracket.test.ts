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
});

describe("build_bracket — partial / empty inputs", () => {
  it("returns an all-empty layout for no fixtures (no throw, padded with nulls)", () => {
    const b = build_bracket([]);
    expect(b.final).toBeNull();
    expect(b.third_place).toBeNull();
    expect(b.sf_left).toBeNull();
    expect(b.sf_right).toBeNull();
    expect(b.qf_left).toEqual([null, null]);
    expect(b.r16_left).toEqual([null, null, null, null]);
    expect(b.r16_right).toEqual([null, null, null, null]);
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
