import type { Player } from "@/domain/player/player";

// Market valuation of a player. Decoupled from Player identity so the pricing
// source (mock today, Sportmonks tomorrow) can evolve independently of the
// player reference data.

export type ValuationSource = "mock" | "sportmonks" | "synthetic" | "engine";

export interface PlayerValuation {
  player_id: number;
  base_value: number; // €M, reference value
  current_price: number; // €M, latest tradable price
  change_24h: number; // %, vs price 24h ago
  performance_rating: number; // 0-10, latest match rating
  as_of: string; // ISO timestamp of the snapshot
  source: ValuationSource;
}

// Convenience join used by surfaces that always need both — screener rows,
// movers lists, watchlist tiles. UI layer reads it like one object.
export interface PlayerWithValuation extends Player {
  valuation: PlayerValuation;
}
