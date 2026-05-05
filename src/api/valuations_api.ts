import type { PlayerValuation } from "@/domain/market/player_valuation";
import { valuation_service, type MoverDirection } from "@/application/valuation_service";

export const valuations_api = {
  get_for_player(player_id: number): PlayerValuation | undefined {
    return valuation_service.get_valuation(player_id);
  },
  get_top_movers(limit?: number, direction: MoverDirection = "up"): PlayerValuation[] {
    return valuation_service.get_top_movers(limit, direction);
  },
};
