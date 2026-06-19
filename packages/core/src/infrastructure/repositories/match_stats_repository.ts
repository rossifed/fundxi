import type { PlayerMatchStat } from "@fundxi/core/domain/match/player_match_stats";
import { api_get } from "@fundxi/core/infrastructure/api_client";

// DDD role: Adapter (driven). Per-player stat lines for ONE fixture, fetched
// from the BFF and memoized per fixture; ``refresh`` re-fetches on a live SSE
// update. Distinct from player_stats_repository (per-player tournament totals).
// Mirrors team_stats_repository.
const _by_fixture_cache = new Map<number, Promise<PlayerMatchStat[]>>();

export const match_stats_repository = {
  fetch_for_fixture(fixture_id: number): Promise<PlayerMatchStat[]> {
    let p = _by_fixture_cache.get(fixture_id);
    if (!p) {
      p = api_get<PlayerMatchStat[]>(`/api/fixtures/${fixture_id}/player-stats`);
      _by_fixture_cache.set(fixture_id, p);
    }
    return p;
  },
  refresh_for_fixture(fixture_id: number): Promise<PlayerMatchStat[]> {
    const p = api_get<PlayerMatchStat[]>(`/api/fixtures/${fixture_id}/player-stats`);
    _by_fixture_cache.set(fixture_id, p);
    return p;
  },
};
