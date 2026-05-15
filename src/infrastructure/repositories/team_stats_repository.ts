import type { TeamMatchStats } from "@/domain/match/team_match_stats";
import { api_get } from "@/infrastructure/api_client";

const _by_fixture_cache = new Map<number, Promise<TeamMatchStats>>();

export const team_stats_repository = {
  fetch_for_fixture(fixture_id: number): Promise<TeamMatchStats> {
    let p = _by_fixture_cache.get(fixture_id);
    if (!p) {
      p = api_get<TeamMatchStats>(`/api/fixtures/${fixture_id}/team-stats`);
      _by_fixture_cache.set(fixture_id, p);
    }
    return p;
  },
  refresh_for_fixture(fixture_id: number): Promise<TeamMatchStats> {
    const p = api_get<TeamMatchStats>(`/api/fixtures/${fixture_id}/team-stats`);
    _by_fixture_cache.set(fixture_id, p);
    return p;
  },
};
