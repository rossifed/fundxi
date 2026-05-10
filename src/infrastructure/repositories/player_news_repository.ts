import { api_get } from "@/infrastructure/api_client";

// Per-player news (proxied by player's team — Sportmonks tags news to
// fixtures, not players directly). Lazy on PlayerSheet open, cached for
// the session.

export interface PlayerNewsEntry {
  id: number;
  fixture_id: number | null;
  league_id: number | null;
  title: string;
  type: string;
  published_at: string | null;
}

const _cache = new Map<number, Promise<PlayerNewsEntry[]>>();

export function fetch_player_news(player_id: number): Promise<PlayerNewsEntry[]> {
  const cached = _cache.get(player_id);
  if (cached) return cached;
  const promise = api_get<PlayerNewsEntry[]>(`/api/players/${player_id}/news`);
  _cache.set(player_id, promise);
  return promise;
}
