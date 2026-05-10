import type { Player } from "@/domain/player/player";
import type { PlayerWithValuation } from "@/domain/market/player_valuation";
import { screener_service, type ScreenerCriteria } from "@/application/screener_service";
import type { MoverDirection } from "@/application/valuation_service";
import { players_repository } from "@/infrastructure/repositories/players_repository";
import {
  fetch_player_tournament_stats,
  type PlayerTournamentStat,
} from "@/infrastructure/repositories/player_stats_repository";
import {
  fetch_player_matches,
  type PlayerMatchEntry,
} from "@/infrastructure/repositories/player_matches_repository";
import {
  fetch_player_news,
  type PlayerNewsEntry,
} from "@/infrastructure/repositories/player_news_repository";

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
