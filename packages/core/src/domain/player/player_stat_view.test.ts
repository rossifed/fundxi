import { describe, expect, it } from "vitest";
import type { PlayerTournamentStat } from "@fundxi/core/infrastructure/repositories/player_stats_repository";
import { build_tournament_stat_groups } from "@fundxi/core/domain/player/player_stat_view";

// All-null baseline so each test sets only the fields it cares about.
function stat(overrides: Partial<PlayerTournamentStat>): PlayerTournamentStat {
  return {
    player_id: 1,
    season_id: 26618,
    appearances: null,
    minutes_played: null,
    goals: null,
    assists: null,
    yellow_cards: null,
    red_cards: null,
    shots_total: null,
    shots_on_target: null,
    key_passes: null,
    passes_total: null,
    passes_accuracy: null,
    rating_avg: null,
    shots_off_target: null,
    offsides: null,
    big_chances_created: null,
    accurate_passes: null,
    crosses_total: null,
    crosses_accurate: null,
    long_balls: null,
    through_balls: null,
    dribble_attempts: null,
    dribbles_completed: null,
    dispossessed: null,
    dribbled_past: null,
    fouls_drawn: null,
    tackles: null,
    interceptions: null,
    clearances: null,
    total_duels: null,
    duels_won: null,
    aerials_won: null,
    shots_blocked: null,
    fouls: null,
    saves: null,
    goals_conceded: null,
    ...overrides,
  };
}

const ALL_GROUPS = ["Overview", "Attacking", "Passing", "Dribbling", "Defending", "Discipline", "Goalkeeping"];

const find = (groups: ReturnType<typeof build_tournament_stat_groups>, title: string) =>
  groups.find(g => g.title === title);
const item = (groups: ReturnType<typeof build_tournament_stat_groups>, group: string, label: string) =>
  find(groups, group)?.items.find(i => i.label === label);

describe("build_tournament_stat_groups", () => {
  it("always emits every family in a fixed order, even for an all-null player", () => {
    const groups = build_tournament_stat_groups(stat({}));
    expect(groups.map(g => g.title)).toEqual(ALL_GROUPS);
    // Goalkeeping is present for outfielders too (predictable layout).
    expect(item(groups, "Goalkeeping", "Saves")?.value).toBe("—");
  });

  it("renders an absent value as a dash and a real 0 as '0'", () => {
    const groups = build_tournament_stat_groups(stat({ fouls: 0, tackles: null }));
    expect(item(groups, "Discipline", "Fouls")?.value).toBe("0");
    expect(item(groups, "Defending", "Tackles")?.value).toBe("—");
  });

  it("colours only real positive values (absent ⇒ neutral)", () => {
    const groups = build_tournament_stat_groups(stat({ goals: 2, assists: null, yellow_cards: 1, red_cards: 1 }));
    expect(item(groups, "Attacking", "Goals")?.semantic).toBe("good");
    expect(item(groups, "Attacking", "Assists")?.semantic).toBe("neutral"); // absent, not coloured
    expect(item(groups, "Discipline", "Yellow")?.semantic).toBe("warn");
    expect(item(groups, "Discipline", "Red")?.semantic).toBe("danger");
  });

  it("shows a ratio as a dash when both sides are absent, else x/y", () => {
    expect(item(build_tournament_stat_groups(stat({})), "Attacking", "Shots OT/Tot")?.value).toBe("—");
    expect(item(build_tournament_stat_groups(stat({ shots_on_target: 2 })), "Attacking", "Shots OT/Tot")?.value).toBe(
      "2/0",
    );
  });

  it("formats rating to one decimal and pass accuracy as a percentage", () => {
    const groups = build_tournament_stat_groups(stat({ rating_avg: 7.214, passes_accuracy: 85.7 }));
    expect(item(groups, "Overview", "Rating")?.value).toBe("7.2");
    expect(item(groups, "Passing", "Pass %")?.value).toBe("86%");
  });

  it("treats an absent counting stat as 0 once the player has featured", () => {
    // Sportmonks omits zero counting stats; a player who played but is missing
    // assists/goals/tackles really has 0, not "unknown".
    const groups = build_tournament_stat_groups(stat({ appearances: 1, minutes_played: 66 }));
    expect(item(groups, "Attacking", "Assists")?.value).toBe("0");
    expect(item(groups, "Attacking", "Goals")?.value).toBe("0");
    expect(item(groups, "Defending", "Tackles")?.value).toBe("0");
    expect(item(groups, "Goalkeeping", "Saves")?.value).toBe("0");
  });

  it("keeps non-counting stats (rating, pass %) as a dash even when featured", () => {
    // An average / a percentage with no value must NOT be synthesised to 0.
    const groups = build_tournament_stat_groups(stat({ minutes_played: 90, rating_avg: null, passes_accuracy: null }));
    expect(item(groups, "Overview", "Rating")?.value).toBe("—");
    expect(item(groups, "Passing", "Pass %")?.value).toBe("—");
  });

  it("shows a 0/0 ratio for a featured player with both sides absent", () => {
    const groups = build_tournament_stat_groups(stat({ appearances: 1 }));
    expect(item(groups, "Attacking", "Shots OT/Tot")?.value).toBe("0/0");
  });

  it("a player who has NOT featured shows dashes throughout", () => {
    const groups = build_tournament_stat_groups(stat({}));
    expect(item(groups, "Attacking", "Assists")?.value).toBe("—");
    expect(item(groups, "Defending", "Tackles")?.value).toBe("—");
  });
});
