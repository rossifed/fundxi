import type { MatchComment } from "@/domain/match/match_comment";
import { api_get } from "@/infrastructure/api_client";

interface MatchCommentDTO {
  id: number;
  fixture_id: number;
  minute: number;
  extra_minute: number | null;
  comment: string;
  is_goal: boolean;
  is_important: boolean;
  sequence: number;
}

function dto_to_domain(dto: MatchCommentDTO): MatchComment {
  return {
    id: dto.id,
    fixture_id: dto.fixture_id,
    minute: dto.minute,
    extra_minute: dto.extra_minute ?? undefined,
    comment: dto.comment,
    is_goal: dto.is_goal,
    is_important: dto.is_important,
    sequence: dto.sequence,
  };
}

const _by_player_cache = new Map<number, Promise<MatchComment[]>>();
const _by_fixture_cache = new Map<number, Promise<MatchComment[]>>();

export const comments_repository = {
  // Per-player comment feed. Cached per id so opening the same player twice
  // doesn't refetch.
  fetch_by_player(player_id: number, limit = 100): Promise<MatchComment[]> {
    let p = _by_player_cache.get(player_id);
    if (!p) {
      p = api_get<MatchCommentDTO[]>(`/api/players/${player_id}/comments`, { limit }).then(arr =>
        arr.map(dto_to_domain),
      );
      _by_player_cache.set(player_id, p);
    }
    return p;
  },
  fetch_by_fixture(fixture_id: number): Promise<MatchComment[]> {
    let p = _by_fixture_cache.get(fixture_id);
    if (!p) {
      p = api_get<MatchCommentDTO[]>(`/api/fixtures/${fixture_id}/comments`).then(arr =>
        arr.map(dto_to_domain),
      );
      _by_fixture_cache.set(fixture_id, p);
    }
    return p;
  },
  // Cache-busting refetch — used by the live-update path when a new
  // commentary lands. Replaces the cache entry with the fresh in-flight
  // request so later `fetch_*` calls see it too.
  refresh_by_fixture(fixture_id: number): Promise<MatchComment[]> {
    const p = api_get<MatchCommentDTO[]>(`/api/fixtures/${fixture_id}/comments`).then(arr =>
      arr.map(dto_to_domain),
    );
    _by_fixture_cache.set(fixture_id, p);
    return p;
  },
  refresh_by_player(player_id: number, limit = 100): Promise<MatchComment[]> {
    const p = api_get<MatchCommentDTO[]>(`/api/players/${player_id}/comments`, { limit }).then(arr =>
      arr.map(dto_to_domain),
    );
    _by_player_cache.set(player_id, p);
    return p;
  },
};
