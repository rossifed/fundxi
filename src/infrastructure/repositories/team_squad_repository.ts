/* team_squad_repository — adapter for a team's players + valuation.
 *
 * DDD role: Adapter (driven). Reuses the existing
 * /api/players/search endpoint with its ``team_ids`` filter — one
 * request returns the team's squad with each player's live valuation.
 */

import { api_get } from "@/infrastructure/api_client";

export interface SquadPlayer {
  id: number;
  name: string;
  full_name: string | null;
  jersey_number: number;
  position: string;
  detailed_position: string | null;
  image_path: string | null;
  age: number | null;
  foot: string | null;
  height: number | null;
  weight: number | null;
  club: string | null;
  valuation: {
    current_price: number;
    change_since_inception: number;
    change_last_match: number;
    performance_rating: number;
  };
}

export async function fetch_team_squad(team_id: string): Promise<SquadPlayer[]> {
  return api_get<SquadPlayer[]>("/api/players/search", { team_ids: [team_id], limit: 60 });
}
