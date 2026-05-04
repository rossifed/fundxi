import type { Player } from "@/domain/player/player";
import { screener_service, type ScreenerCriteria } from "@/application/screener_service";
import { players_repository } from "@/infrastructure/repositories/players_repository";

export const players_api = {
  list(): Player[] {
    return players_repository.find_all();
  },
  get(id: number): Player | undefined {
    return players_repository.find_by_id(id);
  },
  search(criteria: ScreenerCriteria): Player[] {
    return screener_service.filter_players(criteria);
  },
  top_movers(limit?: number): Player[] {
    return screener_service.top_movers(limit);
  },
};
