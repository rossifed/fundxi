import type { PlayerValuation } from "@fundxi/core/domain/market/player_valuation";
import { valuation_service, type MoverDirection } from "@fundxi/core/application/valuation_service";
import {
  fetch_price_history,
  refresh_price_history,
  refresh_valuations,
  spark_for_player,
  type PricePoint,
} from "@fundxi/core/infrastructure/repositories/valuations_repository";

export const valuations_api = {
  get_for_player(player_id: number): PlayerValuation | undefined {
    return valuation_service.get_valuation(player_id);
  },
  /** Real-prices sparkline for a player — fixed-length, resampled, drawn
   * from the already-loaded sparkline cache (synchronous, no fetch). */
  get_sparkline(player_id: number): number[] {
    return spark_for_player(player_id);
  },
  get_top_movers(limit?: number, direction: MoverDirection = "up"): PlayerValuation[] {
    return valuation_service.get_top_movers(limit, direction);
  },
  /** Async — full price-tick history for the chart. */
  get_price_history(player_id: number): Promise<PricePoint[]> {
    return fetch_price_history(player_id);
  },
  /** Async — re-fetch all current prices after a live price tick. */
  refresh(): Promise<void> {
    return refresh_valuations();
  },
  /** Async — cache-busting refetch of one player's price history (live tick). */
  refresh_price_history(player_id: number): Promise<PricePoint[]> {
    return refresh_price_history(player_id);
  },
};
