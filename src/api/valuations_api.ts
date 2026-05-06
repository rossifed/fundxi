import type { PlayerValuation } from "@/domain/market/player_valuation";
import { valuation_service, type MoverDirection } from "@/application/valuation_service";
import { fetch_price_history, type PricePoint } from "@/infrastructure/repositories/valuations_repository";

export const valuations_api = {
  get_for_player(player_id: number): PlayerValuation | undefined {
    return valuation_service.get_valuation(player_id);
  },
  get_top_movers(limit?: number, direction: MoverDirection = "up"): PlayerValuation[] {
    return valuation_service.get_top_movers(limit, direction);
  },
  /** Async — full price-tick history for the chart. */
  get_price_history(player_id: number): Promise<PricePoint[]> {
    return fetch_price_history(player_id);
  },
};
