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

const find = (groups: ReturnType<typeof build_tournament_stat_groups>, title: string) =>
  groups.find(g => g.title === title);

describe("build_tournament_stat_groups", () => {
  it("emits only groups that have at least one present KPI", () => {
    const groups = build_tournament_stat_groups(stat({ appearances: 3, minutes_played: 210 }));
    expect(groups.map(g => g.title)).toEqual(["Overview"]);
    // Goalkeeping/Defending/etc. are dropped when the provider sent nothing.
    expect(find(groups, "Goalkeeping")).toBeUndefined();
  });

  it("never fabricates a 0 for an absent stat (null is dropped, real 0 is kept)", () => {
    const groups = build_tournament_stat_groups(stat({ appearances: 1, fouls: 0 }));
    const discipline = find(groups, "Discipline");
    expect(discipline?.items.map(i => i.label)).toEqual(["Fouls"]);
    expect(discipline?.items[0].value).toBe("0");
  });

  it("shows Goalkeeping only for keepers (saves present)", () => {
    const groups = build_tournament_stat_groups(stat({ appearances: 2, saves: 5, goals_conceded: 1 }));
    const gk = find(groups, "Goalkeeping");
    expect(gk?.items.map(i => i.label)).toEqual(["Saves", "Conceded"]);
    expect(find(groups, "Goalkeeping")?.items.find(i => i.label === "Saves")?.semantic).toBe("good");
  });

  it("maps card semantics (yellow=warn, red=danger) and goals=good", () => {
    const groups = build_tournament_stat_groups(stat({ goals: 2, yellow_cards: 1, red_cards: 1 }));
    const attacking = find(groups, "Attacking");
    const discipline = find(groups, "Discipline");
    expect(attacking?.items.find(i => i.label === "Goals")?.semantic).toBe("good");
    expect(discipline?.items.find(i => i.label === "Yellow")?.semantic).toBe("warn");
    expect(discipline?.items.find(i => i.label === "Red")?.semantic).toBe("danger");
  });

  it("renders a ratio when either side is present (missing side as 0)", () => {
    const groups = build_tournament_stat_groups(stat({ shots_on_target: 2 }));
    const shots = find(groups, "Attacking")?.items.find(i => i.label === "Shots OT/Tot");
    expect(shots?.value).toBe("2/0");
  });

  it("formats rating to one decimal and pass accuracy as a percentage", () => {
    const groups = build_tournament_stat_groups(stat({ rating_avg: 7.214, passes_accuracy: 85.7, passes_total: 50 }));
    expect(find(groups, "Overview")?.items.find(i => i.label === "Rating")?.value).toBe("7.2");
    expect(find(groups, "Passing")?.items.find(i => i.label === "Pass %")?.value).toBe("86%");
  });
});
