import type { Player } from "@/domain/player/player";
import type { PlayerWithValuation } from "@/domain/market/player_valuation";
import { screener_service, type ScreenerCriteria } from "@/application/screener_service";
import type { MoverDirection } from "@/application/valuation_service";
import { players_repository } from "@/infrastructure/repositories/players_repository";

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
};
