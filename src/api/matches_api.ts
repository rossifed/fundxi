import { match_service } from "@/application/match_service";
import type { Match, MatchEvent, MatchPlayer } from "@/domain/match/match";
import type { Fixture } from "@/domain/match/fixture";
import { fixtures_repository } from "@/infrastructure/repositories/fixtures_repository";

export const matches_api = {
  list_fixtures(): Fixture[] {
    return fixtures_repository.find_all();
  },
  get_match(home_team_id: string, away_team_id: string): Match | undefined {
    return match_service.get_match_by_teams(home_team_id, away_team_id);
  },
  get_live_match(): Match | undefined {
    return match_service.get_live_match();
  },
  get_resolved_lineups(match: Match): { home: MatchPlayer[]; away: MatchPlayer[] } {
    return match_service.get_resolved_lineups(match);
  },
  get_match_feed(home_team_id: string, away_team_id: string): MatchEvent[] {
    return match_service.get_match_feed(home_team_id, away_team_id);
  },
};
