import { describe, expect, it } from "vitest";
import type { PlayerMatchStat } from "./player_match_stats";
import { build_leader_cards, compute_stat_leaders, MIN_PASSES_FOR_ACCURACY } from "./match_leaders";

// --- helpers --------------------------------------------------------------

function stat(player_id: number, over: Partial<PlayerMatchStat> = {}): PlayerMatchStat {
  return {
    player_id,
    minutes_played: 90,
    shots_total: null,
    shots_on_target: null,
    goals: null,
    assists: null,
    yellow_cards: null,
    red_cards: null,
    key_passes: null,
    passes_total: null,
    passes_accuracy: null,
    rating: null,
    xg: null,
    ...over,
  };
}

// --- tests ----------------------------------------------------------------

describe("compute_stat_leaders", () => {
  it("returns no leaders for an empty fixture", () => {
    expect(compute_stat_leaders([])).toEqual({});
  });

  it("picks the argmax per metric and carries the right secondary", () => {
    const stats = [
      stat(1, { goals: 2, assists: 1, shots_total: 3, shots_on_target: 2 }),
      stat(2, { goals: 1, key_passes: 4, assists: 0 }),
      stat(3, { shots_total: 5, shots_on_target: 1, xg: 0.9 }),
    ];
    const leaders = compute_stat_leaders(stats);

    expect(leaders.scorer).toEqual({ player_id: 1, value: 2, secondary: 1 });
    expect(leaders.playmaker).toEqual({ player_id: 2, value: 4, secondary: 0 });
    expect(leaders.shots).toEqual({ player_id: 3, value: 5, secondary: 1 });
    expect(leaders.dangerous).toEqual({ player_id: 3, value: 0.9, secondary: null });
  });

  it("ignores null and non-positive metric values", () => {
    const leaders = compute_stat_leaders([stat(1, { goals: 0 }), stat(2, { goals: null })]);
    expect(leaders.scorer).toBeUndefined();
  });

  it("requires a minimum pass volume for the pass-accuracy leader", () => {
    // A perfect-but-tiny passer must NOT beat a high-volume strong passer.
    const sub = stat(1, { passes_accuracy: 100, passes_total: MIN_PASSES_FOR_ACCURACY - 1 });
    const metronome = stat(2, { passes_accuracy: 94, passes_total: 80 });
    const leaders = compute_stat_leaders([sub, metronome]);
    expect(leaders.passer).toEqual({ player_id: 2, value: 94, secondary: 80 });
  });

  it("yields no pass leader when nobody clears the volume floor", () => {
    const leaders = compute_stat_leaders([stat(1, { passes_accuracy: 100, passes_total: 3 })]);
    expect(leaders.passer).toBeUndefined();
  });

  it("keeps the first row on a tie (stable)", () => {
    const leaders = compute_stat_leaders([stat(7, { goals: 1 }), stat(9, { goals: 1 })]);
    expect(leaders.scorer?.player_id).toBe(7);
  });
});

describe("build_leader_cards", () => {
  it("returns nothing when there is no mover and no stats", () => {
    expect(build_leader_cards([{ id: 1, change_this_match: 0 }], [])).toEqual([]);
  });

  it("emits the mover card for the biggest gainer, formatted with an arrow", () => {
    const cards = build_leader_cards(
      [
        { id: 1, change_this_match: 2.3 },
        { id: 2, change_this_match: 8.31 },
        { id: 3, change_this_match: -4 },
      ],
      [],
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ key: "mover", player_id: 2, value: "▲ +8.3%", tone: "positive" });
  });

  it("ignores movers below the noise floor", () => {
    expect(build_leader_cards([{ id: 1, change_this_match: 0.04 }], [])).toEqual([]);
  });

  it("orders cards mover → scorer → dangerous → playmaker → shots → passer", () => {
    const cards = build_leader_cards(
      [{ id: 1, change_this_match: 5 }],
      [
        stat(1, { goals: 1, xg: 0.4, key_passes: 2, shots_total: 3, shots_on_target: 1, passes_accuracy: 90, passes_total: 40 }),
      ],
    );
    expect(cards.map(c => c.key)).toEqual(["mover", "scorer", "dangerous", "playmaker", "shots", "passer"]);
    expect(cards.find(c => c.key === "passer")?.value).toBe("90%");
    expect(cards.find(c => c.key === "dangerous")?.value).toBe("0.40");
  });
});
