import type { PlayerMatchStat } from "@fundxi/core/domain/match/player_match_stats";
import { match_stats_repository } from "@fundxi/core/infrastructure/repositories/match_stats_repository";

// UI contract surface for per-player match stats. Mirrors team_stats_api.
export const match_stats_api = {
  for_fixture(fixture_id: number): Promise<PlayerMatchStat[]> {
    return match_stats_repository.fetch_for_fixture(fixture_id);
  },
  /** Cache-busting refetch — call on a live SSE update for this fixture. */
  refresh_for_fixture(fixture_id: number): Promise<PlayerMatchStat[]> {
    return match_stats_repository.refresh_for_fixture(fixture_id);
  },
};
