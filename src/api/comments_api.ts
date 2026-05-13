import type { MatchComment } from "@/domain/match/match_comment";
import { comments_repository } from "@/infrastructure/repositories/comments_repository";

export const comments_api = {
  for_player(player_id: number, limit = 100): Promise<MatchComment[]> {
    return comments_repository.fetch_by_player(player_id, limit);
  },
  for_fixture(fixture_id: number): Promise<MatchComment[]> {
    return comments_repository.fetch_by_fixture(fixture_id);
  },
  /** Cache-busting refetch — call on a live SSE update for this fixture. */
  refresh_for_fixture(fixture_id: number): Promise<MatchComment[]> {
    return comments_repository.refresh_by_fixture(fixture_id);
  },
  /** Cache-busting refetch — call on a live SSE update for this player. */
  refresh_for_player(player_id: number, limit = 100): Promise<MatchComment[]> {
    return comments_repository.refresh_by_player(player_id, limit);
  },
};
