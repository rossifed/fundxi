import type { Fixture } from "@/domain/match/fixture";

const FIXTURES: Fixture[] = [
  { id: 1, home_team_id: "MEX", away_team_id: "IRN", date: "Jun 11", status: "upcoming", group: "A", note: "Opening · Azteca" },
  { id: 5, home_team_id: "FRA", away_team_id: "COL", home_score: 2, away_score: 1, status: "live", minute: 72, group: "D" },
  { id: 6, home_team_id: "NOR", away_team_id: "KOR", home_score: 3, away_score: 2, date: "Jun 14", status: "finished", group: "H" },
  { id: 3, home_team_id: "USA", away_team_id: "ENG", date: "Jun 14", status: "upcoming", group: "B" },
  { id: 4, home_team_id: "ESP", away_team_id: "JPN", date: "Jun 15", status: "upcoming", group: "E" },
  { id: 7, home_team_id: "CIV", away_team_id: "CRO", home_score: 1, away_score: 1, date: "Jun 13", status: "finished", group: "G" },
  { id: 8, home_team_id: "BRA", away_team_id: "CIV", date: "Jun 17", status: "upcoming", group: "G" },
  { id: 9, home_team_id: "GER", away_team_id: "JPN", date: "Jun 16", status: "upcoming", group: "F" },
  { id: 2, home_team_id: "ARG", away_team_id: "MAR", date: "Jun 12", status: "upcoming", group: "A" },
];

export const fixtures_repository = {
  find_all(): Fixture[] {
    return FIXTURES;
  },
};
