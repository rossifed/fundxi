import type { League, LeagueSummary } from "@fundxi/core/domain/league/league";
import {
  create_league,
  fetch_league_detail,
  join_league,
  leagues_repository,
  refresh_leagues,
} from "@fundxi/core/infrastructure/repositories/leagues_repository";

export const leagues_api = {
  /** Cached league summaries for the current user (tabs + Home widget). */
  list_summaries(): readonly LeagueSummary[] {
    return leagues_repository.find_summaries();
  },
  /** Full league with leaderboard — fetched on demand for one league. */
  async detail(id: string): Promise<League> {
    return fetch_league_detail(id);
  },
  async create(name: string): Promise<League> {
    return create_league(name);
  },
  async join(invite_code: string): Promise<League> {
    return join_league(invite_code);
  },
  async refresh(): Promise<void> {
    return refresh_leagues();
  },
};
