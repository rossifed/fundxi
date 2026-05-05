import type { Match, MatchEvent, MatchPlayer } from "@/domain/match/match";
import type { Player } from "@/domain/player/player";
import { matches_repository } from "@/infrastructure/repositories/matches_repository";
import { players_repository } from "@/infrastructure/repositories/players_repository";
import { valuations_repository } from "@/infrastructure/repositories/valuations_repository";

// Resolve a lineup that may contain raw player_ids (looked up from the players repository)
// or already-inlined MatchPlayer entries (subs unique to the match).
export function resolve_lineup(lineup: (number | MatchPlayer)[]): MatchPlayer[] {
  return lineup
    .map(entry => {
      if (typeof entry !== "number") return entry;
      const player = players_repository.find_by_id(entry);
      if (!player) return null;
      return to_match_player(player);
    })
    .filter((x): x is MatchPlayer => x !== null);
}

function to_match_player(player: Player): MatchPlayer {
  const v = valuations_repository.find_by_player_id(player.id);
  return {
    id: player.id,
    name: player.name,
    full_name: player.full_name,
    jersey_number: player.jersey_number,
    position: player.position,
    value: v?.current_price ?? 0,
    rating: v?.performance_rating ?? 0,
    team_id: player.team_id,
    change_24h: v?.change_24h ?? 0,
    tags: player.tags,
  };
}

export const match_service = {
  get_match_by_teams(home_team_id: string, away_team_id: string): Match | undefined {
    return matches_repository.find_by_teams(home_team_id, away_team_id);
  },

  get_live_match(): Match | undefined {
    return matches_repository.get_live_match();
  },

  get_resolved_lineups(match: Match): { home: MatchPlayer[]; away: MatchPlayer[] } {
    return {
      home: resolve_lineup(match.home_xi),
      away: resolve_lineup(match.away_xi),
    };
  },

  get_match_feed(home_team_id: string, away_team_id: string): MatchEvent[] {
    return matches_repository.get_match_feed(home_team_id, away_team_id);
  },
};
