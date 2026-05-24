import type { Player } from "@fundxi/core/domain/player/player";
import type { PlayerWithValuation } from "@fundxi/core/domain/market/player_valuation";
import { screener_service, type ScreenerCriteria } from "@fundxi/core/application/screener_service";
import type { MoverDirection } from "@fundxi/core/application/valuation_service";
import { players_repository } from "@fundxi/core/infrastructure/repositories/players_repository";
import {
  fetch_player_tournament_stats,
  type PlayerTournamentStat,
} from "@fundxi/core/infrastructure/repositories/player_stats_repository";
import {
  fetch_player_matches,
  type PlayerMatchEntry,
} from "@fundxi/core/infrastructure/repositories/player_matches_repository";
import {
  fetch_player_news,
  type PlayerNewsEntry,
} from "@fundxi/core/infrastructure/repositories/player_news_repository";

export const players_api = {
  list(): Player[] {
    return players_repository.find_all();
  },
  get(id: number): Player | undefined {
    return players_repository.find_by_id(id);
  },
  search(criteria: ScreenerCriteria): PlayerWithValuation[] {
    return screener_service.filter_players(criteria);
  },
  top_movers(limit?: number, direction: MoverDirection = "up"): PlayerWithValuation[] {
    return screener_service.top_movers(limit, direction);
  },
  get_tournament_stats(player_id: number): Promise<PlayerTournamentStat | null> {
    return fetch_player_tournament_stats(player_id);
  },
  get_matches(player_id: number): Promise<PlayerMatchEntry[]> {
    return fetch_player_matches(player_id);
  },
  get_news(player_id: number): Promise<PlayerNewsEntry[]> {
    return fetch_player_news(player_id);
  },
};
