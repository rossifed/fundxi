/* standings_repository — adapter for GET /api/standings.
 *
 * DDD role: Adapter (driven). One request returns every group's table,
 * already enriched server-side with team name + flag — the UI renders,
 * it does not join.
 */

import { api_get } from "@fundxi/core/infrastructure/api_client";

export interface StandingRow {
  team_id: string;
  team_name: string;
  flag: string; // crest image URL
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
}

export interface GroupStanding {
  group: string;
  rows: StandingRow[];
}

export async function fetch_standings(): Promise<GroupStanding[]> {
  return api_get<GroupStanding[]>("/api/standings");
}
