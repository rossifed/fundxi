import { describe, expect, it } from "vitest";
import { compute_portfolio_breakdowns, type EnrichedHolding, type TeamRef } from "./portfolio_breakdown";
import type { Player } from "../player/player";

const player = (over: Partial<Player>): Player => ({
  id: 1,
  name: "P",
  jersey_number: 9,
  team_id: "ARG",
  position: "FW",
  ...over,
});

/** Build only the fields compute_portfolio_breakdowns reads (market_value,
 * pnl, player). The rest of HoldingMetrics is filled with coherent values. */
const holding = (over: {
  player_id: number;
  market_value: number;
  pnl?: number;
  team_id?: string;
  position?: Player["position"];
  age?: number;
}): EnrichedHolding => ({
  player_id: over.player_id,
  shares: 1,
  average_buy_price: 1,
  current_price: over.market_value,
  market_value: over.market_value,
  cost_basis: 0,
  pnl: over.pnl ?? 0,
  return_pct: 0,
  display_shares: 1,
  pct_of_player: 100,
  price_per_share: over.market_value,
  avg_buy_per_share: 1,
  player: player({ id: over.player_id, team_id: over.team_id, position: over.position, age: over.age }),
});

const teams: Record<string, TeamRef> = {
  ARG: { id: "ARG", name: "Argentina", flag: "🇦🇷" },
  FRA: { id: "FRA", name: "France", flag: "🇫🇷" },
};
const resolve = (id: string): TeamRef | undefined => teams[id];

describe("compute_portfolio_breakdowns — by_team", () => {
  it("sums absolute exposure per team, sorts descending, pct of gross exposure", () => {
    const r = compute_portfolio_breakdowns(
      [
        holding({ player_id: 1, market_value: 30, team_id: "ARG" }),
        holding({ player_id: 2, market_value: 70, team_id: "FRA" }),
        holding({ player_id: 3, market_value: 20, team_id: "ARG" }),
      ],
      resolve,
    );
    // gross exposure = 30 + 70 + 20 = 120
    expect(r.by_team.map(t => [t.key, t.value, t.pct])).toEqual([
      ["FRA", 70, (70 / 120) * 100],
      ["ARG", 50, (50 / 120) * 100],
    ]);
    expect(r.by_team[0].name).toBe("France");
    expect(r.by_team[0].flag).toBe("🇫🇷");
  });

  it("drops holdings whose team cannot be resolved (no invented slice)", () => {
    const r = compute_portfolio_breakdowns(
      [holding({ player_id: 1, market_value: 40, team_id: "ARG" }), holding({ player_id: 2, market_value: 10, team_id: "ZZZ" })],
      resolve,
    );
    expect(r.by_team).toHaveLength(1);
    expect(r.by_team[0].key).toBe("ARG");
  });
});

describe("compute_portfolio_breakdowns — shorts (exposure, not netted)", () => {
  it("counts a short as positive exposure (|market_value|) so it is not dropped", () => {
    // A short carries a NEGATIVE market_value; the allocation must still show it.
    const r = compute_portfolio_breakdowns(
      [
        holding({ player_id: 1, market_value: 30, team_id: "ARG", position: "FW", age: 28 }),
        holding({ player_id: 2, market_value: -10, team_id: "FRA", position: "DF", age: 28 }),
      ],
      resolve,
    );
    // gross = 30 + |−10| = 40
    expect(r.by_team.map(t => [t.key, t.value])).toEqual([
      ["ARG", 30],
      ["FRA", 10],
    ]);
    expect(r.by_team.map(t => t.pct)).toEqual([(30 / 40) * 100, (10 / 40) * 100]);
    // by_age is NOT empty even with a short leg (the empty-chart bug we fixed).
    expect(r.by_age.find(a => a.label === "26-30")?.value).toBe(40);
  });

  it("does NOT net a long and a short on the same team (opposite bets are real exposure)", () => {
    const r = compute_portfolio_breakdowns(
      [
        holding({ player_id: 1, market_value: 30, team_id: "ARG" }),
        holding({ player_id: 2, market_value: -30, team_id: "ARG" }),
      ],
      resolve,
    );
    expect(r.by_team).toHaveLength(1);
    expect(r.by_team[0].value).toBe(60); // 30 + |−30|, not 0
  });
});

describe("compute_portfolio_breakdowns — by_position", () => {
  it("aggregates per position, labels via POSITION_LABEL, sorts descending", () => {
    const r = compute_portfolio_breakdowns(
      [
        holding({ player_id: 1, market_value: 10, position: "FW" }),
        holding({ player_id: 2, market_value: 25, position: "MF" }),
        holding({ player_id: 3, market_value: 5, position: "FW" }),
      ],
      resolve,
    );
    expect(r.by_position.map(p => [p.key, p.label, p.value])).toEqual([
      ["MF", "Midfield", 25],
      ["FW", "Forward", 15],
    ]);
  });
});

describe("compute_portfolio_breakdowns — by_age", () => {
  it("buckets ages, keeps bucket order (U21→31+), drops empty buckets", () => {
    const r = compute_portfolio_breakdowns(
      [
        holding({ player_id: 1, market_value: 10, age: 19 }), // U21
        holding({ player_id: 2, market_value: 20, age: 28 }), // 26-30
        holding({ player_id: 3, market_value: 5, age: 40 }), // 31+
      ],
      resolve,
    );
    expect(r.by_age.map(a => a.label)).toEqual(["U21", "26-30", "31+"]);
    expect(r.by_age.map(a => a.value)).toEqual([10, 20, 5]);
  });

  it("unknown age falls into the 21-25 bucket", () => {
    const r = compute_portfolio_breakdowns([holding({ player_id: 1, market_value: 10, age: undefined })], resolve);
    expect(r.by_age.map(a => a.label)).toEqual(["21-25"]);
  });
});

describe("compute_portfolio_breakdowns — win_rate", () => {
  it("is the share of positions in profit, in percent", () => {
    const r = compute_portfolio_breakdowns(
      [
        holding({ player_id: 1, market_value: 10, pnl: 5 }),
        holding({ player_id: 2, market_value: 10, pnl: -3 }),
        holding({ player_id: 3, market_value: 10, pnl: 2 }),
        holding({ player_id: 4, market_value: 10, pnl: 0 }), // flat is not a win
      ],
      resolve,
    );
    expect(r.win_rate).toBe(50); // 2 of 4
  });

  it("is null for an empty portfolio", () => {
    const r = compute_portfolio_breakdowns([], resolve);
    expect(r.win_rate).toBeNull();
  });
});

describe("compute_portfolio_breakdowns — divide-by-zero guard", () => {
  it("yields 0 pct (not NaN/Infinity) when gross exposure is 0", () => {
    const r = compute_portfolio_breakdowns([holding({ player_id: 1, market_value: 0, team_id: "ARG" })], resolve);
    expect(r.by_team[0].pct).toBe(0);
    expect(Number.isFinite(r.by_team[0].pct)).toBe(true);
  });
});
