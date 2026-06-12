import { api_get } from "@fundxi/core/infrastructure/api_client";

// Tournament stats per player+season. Fetched on-demand by the PlayerSheet —
// not part of the bootstrap wave because the screener / home / portfolio
// don't need them. One round-trip per player_id, cached forever for the
// session (stats only change after a fixture finishes and a re-bootstrap).

export interface PlayerTournamentStat {
  player_id: number;
  season_id: number;
  // Core
  appearances: number | null;
  minutes_played: number | null;
  goals: number | null;
  assists: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  shots_total: number | null;
  shots_on_target: number | null;
  key_passes: number | null;
  passes_total: number | null;
  passes_accuracy: number | null;
  rating_avg: number | null;
  // Attacking / shooting
  shots_off_target: number | null;
  offsides: number | null;
  big_chances_created: number | null;
  // Passing / creation
  accurate_passes: number | null;
  crosses_total: number | null;
  crosses_accurate: number | null;
  long_balls: number | null;
  through_balls: number | null;
  // Dribble / take-on
  dribble_attempts: number | null;
  dribbles_completed: number | null;
  dispossessed: number | null;
  dribbled_past: number | null;
  fouls_drawn: number | null;
  // Defence / duels
  tackles: number | null;
  interceptions: number | null;
  clearances: number | null;
  total_duels: number | null;
  duels_won: number | null;
  aerials_won: number | null;
  shots_blocked: number | null;
  // Discipline
  fouls: number | null;
  // Goalkeeping
  saves: number | null;
  goals_conceded: number | null;
}

const _cache = new Map<number, Promise<PlayerTournamentStat | null>>();

export function fetch_player_tournament_stats(
  player_id: number,
): Promise<PlayerTournamentStat | null> {
  const cached = _cache.get(player_id);
  if (cached) return cached;
  const promise = api_get<PlayerTournamentStat | null>(`/api/players/${player_id}/tournament-stats`);
  _cache.set(player_id, promise);
  return promise;
}
