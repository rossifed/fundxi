import type { PlayerValuation, ValuationSource } from "@/domain/market/player_valuation";
import { api_get } from "@/infrastructure/api_client";

// Backend returns one valuation per player via the `valuation` field on
// /api/players/search. Calling that route with a high `limit` gives us all
// players + valuations in a single request — much cheaper than 1 call per
// player.

interface PlayerWithValuationDTO {
  id: number;
  valuation: {
    player_id: number;
    base_value: number;
    current_price: number;
    change_24h: number;
    performance_rating: number;
    as_of: string;
    source: string;
  };
}

let VALUATIONS: PlayerValuation[] = [];
let VALUATIONS_BY_PLAYER_ID = new Map<number, PlayerValuation>();

function dto_to_domain(dto: PlayerWithValuationDTO["valuation"]): PlayerValuation {
  return {
    player_id: dto.player_id,
    base_value: dto.base_value,
    current_price: dto.current_price,
    change_24h: dto.change_24h,
    performance_rating: dto.performance_rating,
    as_of: dto.as_of,
    source: dto.source as ValuationSource,
  };
}

export async function init_valuations_repository(): Promise<void> {
  const dtos = await api_get<PlayerWithValuationDTO[]>("/api/players/search", { limit: 2000 });
  VALUATIONS = dtos.map(d => dto_to_domain(d.valuation));
  VALUATIONS_BY_PLAYER_ID = new Map(VALUATIONS.map(v => [v.player_id, v]));
}

export const valuations_repository = {
  find_all(): PlayerValuation[] {
    return VALUATIONS;
  },
  find_by_player_id(player_id: number): PlayerValuation | undefined {
    return VALUATIONS_BY_PLAYER_ID.get(player_id);
  },
};
