import type { Match, MatchEvent, MatchPlayer, MatchStatus } from "@fundxi/core/domain/match/match";
import type { Position } from "@fundxi/core/domain/player/player";
import { api_get } from "@fundxi/core/infrastructure/api_client";
import { fixtures_repository } from "@fundxi/core/infrastructure/repositories/fixtures_repository";

interface MatchPlayerDTO {
  id: number;
  name: string;
  full_name: string | null;
  jersey_number: number | null;
  position: string;
  team_id: string;
  value: number;
  rating: number;
  change_last_match: number;
  formation_position: number | null;
  formation_field: string | null;
}

interface MatchEventDTO {
  minute: number;
  extra_minute: number | null;
  type: string;
  player_id: number | null;
  player_name: string | null;
  related_player_id: number | null;
  related_player_name: string | null;
  team_id: string | null;
  headline: string | null;
  info: string | null;
  is_own_goal?: boolean | null;
}

interface MatchResponseDTO {
  fixture_id: number;
  home_team_id: string;
  away_team_id: string;
  status: string;
  group: string;
  home_score: number | null;
  away_score: number | null;
  minute: number | null;
  home_kit_color: string | null;
  away_kit_color: string | null;
  home_formation: string | null;
  away_formation: string | null;
  home_xi: MatchPlayerDTO[];
  away_xi: MatchPlayerDTO[];
  home_bench: MatchPlayerDTO[];
  away_bench: MatchPlayerDTO[];
  events: MatchEventDTO[];
}

function dto_player(p: MatchPlayerDTO): MatchPlayer {
  return {
    id: p.id,
    name: p.name,
    full_name: p.full_name ?? undefined,
    jersey_number: p.jersey_number ?? 0,
    position: p.position as Position,
    value: p.value,
    rating: p.rating,
    team_id: p.team_id,
    change_last_match: p.change_last_match,
    formation_field: p.formation_field,
  };
}

function dto_event(e: MatchEventDTO): MatchEvent {
  return {
    minute: e.minute,
    extra_minute: e.extra_minute ?? undefined,
    type: e.type,
    player_id: e.player_id ?? 0,
    player_name: e.player_name ?? undefined,
    related_player_id: e.related_player_id ?? undefined,
    related_player_name: e.related_player_name ?? undefined,
    team_id: e.team_id ?? undefined,
    headline: e.headline ?? undefined,
    comment: e.info ?? undefined,
    is_own_goal: e.is_own_goal ?? false,
  };
}

function dto_to_match(dto: MatchResponseDTO): Match {
  return {
    fixture_id: dto.fixture_id,
    home_team_id: dto.home_team_id,
    away_team_id: dto.away_team_id,
    home_score: dto.home_score ?? 0,
    away_score: dto.away_score ?? 0,
    minute: dto.minute ?? 0,
    group: dto.group ?? "",
    status: dto.status as MatchStatus,
    home_kit_color: dto.home_kit_color ?? undefined,
    away_kit_color: dto.away_kit_color ?? undefined,
    home_formation: dto.home_formation ?? undefined,
    away_formation: dto.away_formation ?? undefined,
    home_xi: dto.home_xi.map(dto_player),
    away_xi: dto.away_xi.map(dto_player),
    home_bench: dto.home_bench.map(dto_player),
    away_bench: dto.away_bench.map(dto_player),
    events: dto.events.map(dto_event),
  };
}

const _by_fixture_cache = new Map<number, Promise<Match>>();
let _live_match: Match | null = null;

function _fetch_by_fixture_id(fixture_id: number): Promise<Match> {
  let p = _by_fixture_cache.get(fixture_id);
  if (!p) {
    p = api_get<MatchResponseDTO>(`/api/fixtures/${fixture_id}/match`).then(dto_to_match);
    _by_fixture_cache.set(fixture_id, p);
  }
  return p;
}

// Cache-busting refetch — used by the live-update path so the MatchView's
// clock / score / scorer list track an in-play (or replayed) match.
function _refresh_by_fixture_id(fixture_id: number): Promise<Match> {
  const p = api_get<MatchResponseDTO>(`/api/fixtures/${fixture_id}/match`).then(dto_to_match);
  _by_fixture_cache.set(fixture_id, p);
  return p;
}

export async function init_matches_repository(): Promise<void> {
  // Pre-fetch the currently live match (if any) so HomePage's sync
  // get_live_match() can serve from cache. On WC2022 (finished) this is
  // a no-op.
  const live_fixture = fixtures_repository.find_all().find(f => f.status === "live");
  if (live_fixture) {
    _live_match = await _fetch_by_fixture_id(live_fixture.id);
  }
}

export const matches_repository = {
  async fetch_by_teams(home_team_id: string, away_team_id: string): Promise<Match | undefined> {
    const fixture = fixtures_repository
      .find_all()
      .find(f => f.home_team_id === home_team_id && f.away_team_id === away_team_id);
    if (!fixture) return undefined;
    return _fetch_by_fixture_id(fixture.id);
  },
  async fetch_by_fixture_id(fixture_id: number): Promise<Match | undefined> {
    return _fetch_by_fixture_id(fixture_id);
  },
  /** Cache-busting refetch of one match — call on a live SSE update. */
  async refresh_by_fixture_id(fixture_id: number): Promise<Match | undefined> {
    return _refresh_by_fixture_id(fixture_id);
  },
  /** Sync — returns the pre-fetched live match (or undefined). */
  get_live_match(): Match | undefined {
    return _live_match ?? undefined;
  },
};
