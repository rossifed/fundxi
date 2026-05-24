import type { PlayerValuation, ValuationSource } from "@fundxi/core/domain/market/player_valuation";
import { api_get } from "@fundxi/core/infrastructure/api_client";

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
    change_since_inception: number;
    change_avg_per_match: number;
    change_last_match: number;
    performance_rating: number;
    as_of: string;
    source: string;
  };
}

let VALUATIONS: PlayerValuation[] = [];
let VALUATIONS_BY_PLAYER_ID = new Map<number, PlayerValuation>();
const SPARK_LENGTH = 16;
let SPARKLINES_BY_PLAYER_ID = new Map<number, number[]>();

function dto_to_domain(dto: PlayerWithValuationDTO["valuation"]): PlayerValuation {
  return {
    player_id: dto.player_id,
    base_value: dto.base_value,
    current_price: dto.current_price,
    change_since_inception: dto.change_since_inception,
    change_avg_per_match: dto.change_avg_per_match,
    change_last_match: dto.change_last_match,
    performance_rating: dto.performance_rating,
    as_of: dto.as_of,
    source: dto.source as ValuationSource,
  };
}

async function _fetch_and_populate(): Promise<void> {
  const [dtos, sparklines] = await Promise.all([
    api_get<PlayerWithValuationDTO[]>("/api/players/search", { limit: 2000 }),
    api_get<Record<string, number[]>>("/api/valuations/sparklines", { length: SPARK_LENGTH }),
  ]);
  VALUATIONS = dtos.map(d => dto_to_domain(d.valuation));
  VALUATIONS_BY_PLAYER_ID = new Map(VALUATIONS.map(v => [v.player_id, v]));
  SPARKLINES_BY_PLAYER_ID = new Map(
    Object.entries(sparklines).map(([pid, points]) => [Number(pid), points]),
  );
}

export async function init_valuations_repository(): Promise<void> {
  await _fetch_and_populate();
}

/** Re-fetch all current prices + sparklines (after a live price tick). */
export async function refresh_valuations(): Promise<void> {
  await _fetch_and_populate();
}

/** Real-prices sparkline for a player, resampled to a fixed length.
 * Falls back to a flat line at `base_value` when the player has no ticks
 * (didn't play yet, or didn't trigger any pricing event). Caller decides
 * the color; this function only provides the y-values. */
export function spark_for_player(player_id: number): number[] {
  const real = SPARKLINES_BY_PLAYER_ID.get(player_id);
  if (real && real.length >= 2) return real;
  const v = VALUATIONS_BY_PLAYER_ID.get(player_id);
  const baseline = v?.base_value ?? 1;
  return Array(SPARK_LENGTH).fill(baseline);
}

/** Average price level across the universe at every sample point —
 * a "WC2026 market index" sparkline. Uses real ticks for every player
 * that has them; players without ticks contribute their flat baseline.
 * Returned series is normalized to start at 100. */
export function spark_market_index(length = SPARK_LENGTH): number[] {
  if (VALUATIONS.length === 0) return Array(length).fill(100);
  const sums = new Array<number>(length).fill(0);
  let counted = 0;
  for (const v of VALUATIONS) {
    const series = SPARKLINES_BY_PLAYER_ID.get(v.player_id);
    const points = series && series.length === length ? series : Array(length).fill(v.base_value);
    for (let i = 0; i < length; i++) sums[i] += points[i] / v.base_value;
    counted += 1;
  }
  if (counted === 0) return Array(length).fill(100);
  return sums.map(s => (s / counted) * 100);
}

export interface PricePoint {
  ts: string; // ISO timestamp
  price: number;
  fixture_id: number | null;
  change_since_open: number;
}

interface PriceHistoryDTO {
  player_id: number;
  points: PricePoint[];
}

const _price_history_cache = new Map<number, Promise<PricePoint[]>>();

export function fetch_price_history(player_id: number): Promise<PricePoint[]> {
  let p = _price_history_cache.get(player_id);
  if (!p) {
    p = api_get<PriceHistoryDTO>(`/api/players/${player_id}/price-history`).then(d => d.points);
    _price_history_cache.set(player_id, p);
  }
  return p;
}

/** Cache-busting refetch of a player's price history — call on a live tick. */
export function refresh_price_history(player_id: number): Promise<PricePoint[]> {
  const p = api_get<PriceHistoryDTO>(`/api/players/${player_id}/price-history`).then(d => d.points);
  _price_history_cache.set(player_id, p);
  return p;
}

export const valuations_repository = {
  find_all(): PlayerValuation[] {
    return VALUATIONS;
  },
  find_by_player_id(player_id: number): PlayerValuation | undefined {
    return VALUATIONS_BY_PLAYER_ID.get(player_id);
  },
};
