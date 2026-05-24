import type { Match, MatchPlayer } from "@fundxi/core/domain/match/match";

// Resolve a lineup that may contain raw player_ids OR already-inlined
// MatchPlayer entries. With the BFF-driven matches_repository, the lineups
// always come back already inlined, so we simply filter out any stray
// number entries (defensive).
export function resolve_lineup(lineup: (number | MatchPlayer)[]): MatchPlayer[] {
  return lineup.filter((x): x is MatchPlayer => typeof x !== "number");
}

export const match_service = {
  get_resolved_lineups(match: Match): { home: MatchPlayer[]; away: MatchPlayer[] } {
    return {
      home: resolve_lineup(match.home_xi),
      away: match.away_xi,
    };
  },
};
