import { api_get } from "@fundxi/core/infrastructure/api_client";

// Per-match summary for a player. Computed entirely from our DB
// (core.fixture + core.lineup + core.match_event aggregated).
// One round-trip per player_id, cached for the session.

export interface PlayerMatchEntry {
  fixture_id: number;
  kickoff_at: string | null;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  player_team_id: string;
  role: string; // "starter" | "bench"
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  in_match_pct: number | null;
}

const _cache = new Map<number, Promise<PlayerMatchEntry[]>>();

export function fetch_player_matches(player_id: number): Promise<PlayerMatchEntry[]> {
  const cached = _cache.get(player_id);
  if (cached) return cached;
  const promise = api_get<PlayerMatchEntry[]>(`/api/players/${player_id}/matches`);
  _cache.set(player_id, promise);
  return promise;
}
