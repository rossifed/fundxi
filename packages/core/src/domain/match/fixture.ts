export type FixtureStatus = "live" | "finished" | "upcoming";

export interface Fixture {
  id: number;
  home_team_id: string;
  away_team_id: string;
  status: FixtureStatus;
  group: string;
  home_score?: number;
  away_score?: number;
  /** Penalty-shootout score (converted penalties per side). Present only when
   * the knockout was decided on penalties; the winner is the higher of the two. */
  home_pen_score?: number;
  away_pen_score?: number;
  date?: string;
  minute?: number;
  note?: string;
  /** Stadium name (e.g. "Lusail Stadium"). */
  venue_name?: string;
  /** Host city of the venue (e.g. "Lusail"). */
  venue_city?: string;
  /** Sportmonks stage label: "Group Stage", "Round of 16", "Quarter-finals",
   * "Semi-finals", "3rd Place Final", "Final". */
  stage_name?: string;
  /** Matchday number within a stage (e.g. "1", "2", "3" for the group stage).
   * Null/undefined for knockout fixtures. */
  round_name?: string;
}
