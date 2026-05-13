import type { Position } from "@/domain/player/player";
import type { PlayerWithValuation } from "@/domain/market/player_valuation";
import { players_repository } from "@/infrastructure/repositories/players_repository";
import { teams_repository } from "@/infrastructure/repositories/teams_repository";
import { valuations_repository } from "@/infrastructure/repositories/valuations_repository";
import type { MoverDirection } from "./valuation_service";

export type SortKey = "value" | "change" | "rating" | "age";

export interface ScreenerCriteria {
  positions?: Set<Position>;
  team_ids?: Set<string>;
  min_value?: number;
  max_value?: number;
  search?: string;
  sort?: SortKey;
}

function enrich_all(): PlayerWithValuation[] {
  return players_repository
    .find_all()
    .map(player => {
      const valuation = valuations_repository.find_by_player_id(player.id);
      return valuation ? { ...player, valuation } : null;
    })
    .filter((x): x is PlayerWithValuation => x !== null);
}

export const screener_service = {
  filter_players(criteria: ScreenerCriteria = {}): PlayerWithValuation[] {
    const positions = criteria.positions;
    const team_ids = criteria.team_ids;
    const min_value = criteria.min_value ?? 0;
    const max_value = criteria.max_value ?? 999;
    const search = criteria.search?.trim().toLowerCase() ?? "";
    const sort_key = criteria.sort ?? "value";

    let result = enrich_all();
    if (positions && positions.size > 0) result = result.filter(p => positions.has(p.position));
    if (team_ids && team_ids.size > 0) result = result.filter(p => team_ids.has(p.team_id));
    result = result.filter(p => p.valuation.current_price >= min_value && p.valuation.current_price <= max_value);
    if (search) {
      result = result.filter(p => {
        const team = teams_repository.find_by_id(p.team_id);
        const haystack = `${p.name}${p.full_name ?? ""}${team?.name ?? ""}`.toLowerCase();
        return haystack.includes(search);
      });
    }

    return [...result].sort((a, b) => {
      switch (sort_key) {
        case "value":
          return b.valuation.current_price - a.valuation.current_price;
        case "change":
          return b.valuation.change_since_inception - a.valuation.change_since_inception;
        case "rating":
          return b.valuation.performance_rating - a.valuation.performance_rating;
        case "age":
          return (a.age ?? 99) - (b.age ?? 99);
      }
    });
  },

  top_movers(limit = 8, direction: MoverDirection = "up"): PlayerWithValuation[] {
    const sign = direction === "up" ? 1 : -1;
    return enrich_all()
      .sort((a, b) => sign * (b.valuation.change_since_inception - a.valuation.change_since_inception))
      .slice(0, limit);
  },
};
