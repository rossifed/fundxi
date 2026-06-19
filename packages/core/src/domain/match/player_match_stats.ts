// PlayerMatchStat — per-player live statistics for ONE fixture.
//
// DDD role: Value Object (read model). Mirrors the backend
// core.player_match_stat row (Sportmonks lineups.details projection).
// Identity (name, photo, team, position) is NOT carried here — the UI
// resolves it by ``player_id`` through the players cache (SRP: this type
// owns the stat line only). Every field is nullable: a value is present
// only once the live ingest has observed it for this fixture.
export interface PlayerMatchStat {
  player_id: number;
  minutes_played: number | null;
  shots_total: number | null;
  shots_on_target: number | null;
  goals: number | null;
  assists: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  key_passes: number | null;
  passes_total: number | null;
  passes_accuracy: number | null;
  rating: number | null;
  xg: number | null;
}
