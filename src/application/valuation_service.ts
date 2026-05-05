import type { PlayerValuation } from "@/domain/market/player_valuation";
import { valuations_repository } from "@/infrastructure/repositories/valuations_repository";

export type MoverDirection = "up" | "down";

export const valuation_service = {
  get_valuation(player_id: number): PlayerValuation | undefined {
    return valuations_repository.find_by_player_id(player_id);
  },

  get_current_price(player_id: number): number {
    return valuations_repository.find_by_player_id(player_id)?.current_price ?? 0;
  },

  get_change_24h(player_id: number): number {
    return valuations_repository.find_by_player_id(player_id)?.change_24h ?? 0;
  },

  get_rating(player_id: number): number {
    return valuations_repository.find_by_player_id(player_id)?.performance_rating ?? 0;
  },

  get_top_movers(limit = 8, direction: MoverDirection = "up"): PlayerValuation[] {
    const sign = direction === "up" ? 1 : -1;
    return [...valuations_repository.find_all()]
      .sort((a, b) => sign * (b.change_24h - a.change_24h))
      .slice(0, limit);
  },
};
