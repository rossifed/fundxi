import type { Player, Position } from "@/domain/player/player";
import { players_repository } from "@/infrastructure/repositories/players_repository";
import { teams_repository } from "@/infrastructure/repositories/teams_repository";

export type SortKey = "value" | "change" | "rating" | "age";

export interface ScreenerCriteria {
  positions?: Set<Position>;
  team_ids?: Set<string>;
  min_value?: number;
  max_value?: number;
  search?: string;
  sort?: SortKey;
}

export const screener_service = {
  filter_players(criteria: ScreenerCriteria = {}): Player[] {
    const all = players_repository.find_all();
    const positions = criteria.positions;
    const team_ids = criteria.team_ids;
    const min_value = criteria.min_value ?? 0;
    const max_value = criteria.max_value ?? 999;
    const search = criteria.search?.trim().toLowerCase() ?? "";
    const sort_key = criteria.sort ?? "value";

    let result = all;
    if (positions && positions.size > 0) result = result.filter(p => positions.has(p.position));
    if (team_ids && team_ids.size > 0) result = result.filter(p => team_ids.has(p.team_id));
    result = result.filter(p => p.value >= min_value && p.value <= max_value);
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
          return b.value - a.value;
        case "change":
          return b.change_24h - a.change_24h;
        case "rating":
          return b.rating - a.rating;
        case "age":
          return (a.age ?? 99) - (b.age ?? 99);
      }
    });
  },

  top_movers(limit = 8): Player[] {
    return [...players_repository.find_all()].sort((a, b) => b.change_24h - a.change_24h).slice(0, limit);
  },
};
