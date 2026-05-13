import type { Fixture } from "@/domain/match/fixture";
import type { Match, MatchPlayer } from "@/domain/match/match";
import { matches_repository } from "@/infrastructure/repositories/matches_repository";
import { fixtures_repository, refresh_fixtures } from "@/infrastructure/repositories/fixtures_repository";

export const matches_api = {
  list_fixtures(): Fixture[] {
    return fixtures_repository.find_all();
  },

  /** Async — re-fetch the fixtures list (status / clock / score may have changed). */
  async refresh_fixtures(): Promise<Fixture[]> {
    await refresh_fixtures();
    return fixtures_repository.find_all();
  },

  /** Async — fetched on demand from the BFF and cached. */
  async get_match(home_team_id: string, away_team_id: string): Promise<Match | undefined> {
    return matches_repository.fetch_by_teams(home_team_id, away_team_id);
  },

  async get_match_by_fixture_id(fixture_id: number): Promise<Match | undefined> {
    return matches_repository.fetch_by_fixture_id(fixture_id);
  },

  /** Async — cache-busting refetch of one match (live clock / score / scorers). */
  async refresh_match_by_fixture_id(fixture_id: number): Promise<Match | undefined> {
    return matches_repository.refresh_by_fixture_id(fixture_id);
  },

  /** Sync — pre-fetched at boot if a fixture is currently live. */
  get_live_match(): Match | undefined {
    return matches_repository.get_live_match();
  },

  /** Backend already returns full MatchPlayer[]; this is a passthrough kept
   * so the existing UI doesn't need to change its call sites. */
  get_resolved_lineups(match: Match): { home: MatchPlayer[]; away: MatchPlayer[] } {
    const home: MatchPlayer[] = match.home_xi.filter((x): x is MatchPlayer => typeof x !== "number");
    return { home, away: match.away_xi };
  },
};
