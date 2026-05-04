export type FixtureStatus = "live" | "finished" | "upcoming";

export interface Fixture {
  id: number;
  home_team_id: string;
  away_team_id: string;
  status: FixtureStatus;
  group: string;
  home_score?: number;
  away_score?: number;
  date?: string;
  minute?: number;
  note?: string;
}
