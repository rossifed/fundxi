import type { TeamMatchStats } from "@/domain/match/team_match_stats";
import { team_stats_repository } from "@/infrastructure/repositories/team_stats_repository";

export const team_stats_api = {
  for_fixture(fixture_id: number): Promise<TeamMatchStats> {
    return team_stats_repository.fetch_for_fixture(fixture_id);
  },
  /** Cache-busting refetch — call on a live SSE update for this fixture. */
  refresh_for_fixture(fixture_id: number): Promise<TeamMatchStats> {
    return team_stats_repository.refresh_for_fixture(fixture_id);
  },
};
