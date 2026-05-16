/* Leagues repository — backend-backed (BFF).
 *
 * - ``init_leagues_repository`` / ``refresh_leagues`` cache the user's
 *   league summaries (``GET /api/leagues/mine``). Used for the tab list
 *   and the Home widget. Auth-only — bootstrapped after login.
 * - ``fetch_league_detail`` pulls the full leaderboard for ONE league on
 *   demand (``GET /api/leagues/{id}``).
 * - ``create_league`` / ``join_league`` mutate then refresh the cache.
 *
 * Mapping note: ``icon`` / ``description`` are pure presentation derived
 * here (not provider/user data) — the backend returns data only. */

import type { League, LeagueEntry, LeagueSummary } from "@/domain/league/league";
import { api_get, api_post } from "@/infrastructure/api_client";

interface SummaryDTO {
  id: number;
  name: string;
  kind: string;
  is_public: boolean;
  invite_code: string | null;
  member_count: number;
  my_rank: number;
  my_return_pct: number;
}

interface EntryDTO {
  rank: number;
  user_id: number;
  name: string;
  value: number;
  return_pct: number;
  is_me: boolean;
}

interface DetailDTO {
  id: number;
  name: string;
  kind: string;
  is_public: boolean;
  invite_code: string | null;
  member_count: number;
  leaderboard: EntryDTO[];
}

function _icon(name: string): string {
  return name.charAt(0).toUpperCase() || "?";
}

function _description(is_public: boolean): string {
  return is_public ? "Everyone on fundXI" : "Private league";
}

function _to_summary(d: SummaryDTO): LeagueSummary {
  return {
    id: String(d.id),
    name: d.name,
    icon: _icon(d.name),
    description: _description(d.is_public),
    member_count: d.member_count,
    is_public: d.is_public,
    invite_code: d.invite_code ?? undefined,
    my_rank: d.my_rank,
    my_return_pct: d.my_return_pct,
  };
}

function _to_league(d: DetailDTO): League {
  const leaderboard: LeagueEntry[] = d.leaderboard.map(e => ({
    rank: e.rank,
    name: e.name,
    value: e.value,
    return_pct: e.return_pct,
    avatar: "",
    is_me: e.is_me,
  }));
  return {
    id: String(d.id),
    name: d.name,
    icon: _icon(d.name),
    description: _description(d.is_public),
    member_count: d.member_count,
    is_public: d.is_public,
    invite_code: d.invite_code ?? undefined,
    leaderboard,
  };
}

let _summaries: LeagueSummary[] = [];

type Listener = () => void;
const _listeners = new Set<Listener>();

function _emit(): void {
  for (const l of _listeners) l();
}

export async function init_leagues_repository(): Promise<void> {
  const dtos = await api_get<SummaryDTO[]>("/api/leagues/mine");
  _summaries = dtos.map(_to_summary);
}

export async function refresh_leagues(): Promise<void> {
  const dtos = await api_get<SummaryDTO[]>("/api/leagues/mine");
  _summaries = dtos.map(_to_summary);
  _emit();
}

/** Reset to anonymous/empty state (called on logout). */
export function clear_leagues(): void {
  _summaries = [];
  _emit();
}

export function subscribe_leagues(l: Listener): () => void {
  _listeners.add(l);
  return () => {
    _listeners.delete(l);
  };
}

export async function fetch_league_detail(id: string): Promise<League> {
  const dto = await api_get<DetailDTO>(`/api/leagues/${id}`);
  return _to_league(dto);
}

export async function create_league(name: string): Promise<League> {
  const dto = await api_post<DetailDTO>("/api/leagues", { name });
  await refresh_leagues();
  return _to_league(dto);
}

export async function join_league(invite_code: string): Promise<League> {
  const dto = await api_post<DetailDTO>("/api/leagues/join", { invite_code });
  await refresh_leagues();
  return _to_league(dto);
}

export const leagues_repository = {
  find_summaries(): readonly LeagueSummary[] {
    return _summaries;
  },
};
