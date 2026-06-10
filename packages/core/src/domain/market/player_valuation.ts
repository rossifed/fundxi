import type { Player } from "@fundxi/core/domain/player/player";

// Market valuation of a player. Decoupled from Player identity so the pricing
// source (mock today, Sportmonks tomorrow) can evolve independently of the
// player reference data.

export type ValuationSource = "mock" | "sportmonks" | "synthetic" | "engine";

export interface PlayerValuation {
  player_id: number;
  base_value: number; // €M, reference value (tournament-open anchor)
  current_price: number; // €M, latest tradable price
  change_since_inception: number; // %, current vs base — the canonical "% change" (screeners / movers)
  change_avg_per_match: number | null; // %, mean net change per fixture priced; null if no match yet
  change_last_match: number | null; // %, net change over the latest fixture; null if no match yet
  performance_rating: number; // 0-10, latest match rating
  as_of: string; // ISO timestamp of the snapshot
  source: ValuationSource;
}

// Convenience join used by surfaces that always need both — screener rows,
// movers lists, watchlist tiles. UI layer reads it like one object.
export interface PlayerWithValuation extends Player {
  valuation: PlayerValuation;
}
