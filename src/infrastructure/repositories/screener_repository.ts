import { api_get } from "@/infrastructure/api_client";

// Single-shot batch payload for the Screener page. Everything is computed
// server-side; the frontend just renders + sorts/filters in memory.

export interface ScreenerEntry {
  id: number;
  name: string;
  full_name: string | null;
  jersey_number: number;
  team_id: string;
  position: string;
  detailed_position: string | null;
  age: number | null;
  foot: string | null;
  height: number | null;
  weight: number | null;
  club: string | null;
  image_path: string | null;

  current_price: number;
  performance_rating: number;
  change_24h: number;
  valuation_as_of: string;
  valuation_source: string;

  since_start_pct: number | null;
  last_match_pct: number | null;
  avg_match_pct: number | null;

  appearances: number | null;
  minutes_played: number | null;
  goals: number | null;
  assists: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  shots_total: number | null;
  shots_on_target: number | null;
  key_passes: number | null;
  rating_avg: number | null;

  held_shares: number;
  average_buy_price: number | null;
  pnl: number | null;
}

let SCREENER_ENTRIES: ScreenerEntry[] = [];

export async function init_screener_repository(): Promise<void> {
  SCREENER_ENTRIES = await api_get<ScreenerEntry[]>("/api/players/screener-view");
}

export const screener_repository = {
  find_all(): ScreenerEntry[] {
    return SCREENER_ENTRIES;
  },
};
