// Application Service (pure): screener filtering + sorting.
//
// Single source for the Screener page's filter/sort logic, shared by the web
// and mobile screens. Both used to reimplement the same filter predicate,
// `pluck` sort extractor and slider-bounds helper inline, and had drifted
// (mobile carried perf/age/held/watch filters the web lacked; the web carried
// team/position/pnl/foot sort keys mobile lacked). This module is the union of
// both so the two surfaces cannot diverge again — see web-mobile-parity.
//
// Operates on ScreenerEntry (the /api/players/screener-view payload), which is
// an infrastructure DTO — hence this lives in application, not domain.

import type { Position } from "../domain/player/player";
import type { ScreenerEntry } from "../infrastructure/repositories/screener_repository";

export type ScreenerSortKey =
  | "name"
  | "team"
  | "position"
  | "value"
  | "pnl"
  | "since_start"
  | "last_match"
  | "avg_match"
  | "appearances"
  | "minutes_played"
  | "goals"
  | "assists"
  | "shots"
  | "yellow_cards"
  | "red_cards"
  | "key_passes"
  | "passes"
  | "passes_accuracy"
  | "rating_avg"
  | "age"
  | "foot"
  | "height"
  | "weight";

export type SortDir = "asc" | "desc";

/** Inclusive [lo, hi] numeric range. ``null`` ⇒ filter inactive. */
export type Range = [number, number];

export interface ScreenerCriteria {
  positions?: ReadonlySet<Position>;
  team_ids?: ReadonlySet<string>;
  price_range?: Range | null;
  perf_range?: Range | null; // since_start_pct
  age_range?: Range | null;
  held_only?: boolean;
  watch_only?: boolean;
  search?: string;
  sort_key?: ScreenerSortKey;
  sort_dir?: SortDir;
}

export interface ScreenerContext {
  /** Resolve a team's display name to enrich the search haystack. */
  team_name?: (team_id: string) => string | undefined;
  /** Player ids the user holds — only consulted when held_only. Same set the
   * row's "held" badge reads, so filter and badge cannot disagree. */
  held_ids?: ReadonlySet<number>;
  /** Player ids in the user's watchlist — only consulted when watch_only. */
  watched_ids?: ReadonlySet<number>;
}

/** True when ``value`` falls within ``range`` (inclusive). An inactive range
 * (null/undefined) always passes; a null value fails an active range. */
function in_range(value: number | null, range: Range | null | undefined): boolean {
  if (!range) return true;
  return value != null && value >= range[0] && value <= range[1];
}

function pluck(e: ScreenerEntry, key: ScreenerSortKey): number | string | null {
  switch (key) {
    case "name": return e.name;
    case "team": return e.team_id;
    case "position": return e.position;
    case "value": return e.current_price;
    case "pnl": return e.pnl;
    case "since_start": return e.since_start_pct;
    case "last_match": return e.last_match_pct;
    case "avg_match": return e.avg_match_pct;
    case "appearances": return e.appearances;
    case "minutes_played": return e.minutes_played;
    case "goals": return e.goals;
    case "assists": return e.assists;
    case "shots": return e.shots_total;
    case "yellow_cards": return e.yellow_cards;
    case "red_cards": return e.red_cards;
    case "key_passes": return e.key_passes;
    case "passes": return e.passes_total;
    case "passes_accuracy": return e.passes_accuracy;
    case "rating_avg": return e.rating_avg;
    case "age": return e.age;
    case "foot": return e.foot;
    case "height": return e.height;
    case "weight": return e.weight;
  }
}

/** Stable sort by ``sort_key``; nulls always sort last regardless of
 * direction. Returns a new array (input untouched). */
export function sort_screener_entries(
  entries: readonly ScreenerEntry[],
  sort_key: ScreenerSortKey,
  sort_dir: SortDir,
): ScreenerEntry[] {
  const dir = sort_dir === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    const va = pluck(a, sort_key);
    const vb = pluck(b, sort_key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string" && typeof vb === "string") return dir * va.localeCompare(vb);
    return dir * ((va as number) - (vb as number));
  });
}

/** Filter then sort the screener dataset. The single entry point both UIs
 * call — the view layer only supplies criteria + context. */
export function filter_screener_entries(
  entries: readonly ScreenerEntry[],
  criteria: ScreenerCriteria,
  ctx: ScreenerContext = {},
): ScreenerEntry[] {
  const { positions, team_ids, price_range, perf_range, age_range, held_only, watch_only } = criteria;
  const q = criteria.search?.trim().toLowerCase() ?? "";

  const result = entries.filter(e => {
    if (positions && positions.size > 0 && !positions.has(e.position as Position)) return false;
    if (team_ids && team_ids.size > 0 && !team_ids.has(e.team_id)) return false;
    if (!in_range(e.current_price, price_range)) return false;
    if (!in_range(e.since_start_pct, perf_range)) return false;
    if (!in_range(e.age, age_range)) return false;
    if (held_only && !ctx.held_ids?.has(e.id)) return false;
    if (watch_only && !ctx.watched_ids?.has(e.id)) return false;
    if (q) {
      const team_name = ctx.team_name?.(e.team_id) ?? "";
      const hay = `${e.name} ${e.full_name ?? ""} ${e.club ?? ""} ${team_name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return sort_screener_entries(result, criteria.sort_key ?? "value", criteria.sort_dir ?? "desc");
}

/** Derive inclusive [lo, hi] slider bounds for a numeric attribute over the
 * live dataset, snapped to ``step``. Falls back when no entry carries the
 * attribute. Never hardcodes ranges — bounds follow the data. */
export function screener_bounds(
  entries: readonly ScreenerEntry[],
  pick: (e: ScreenerEntry) => number | null,
  step: number,
  fallback: Range,
): Range {
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of entries) {
    const v = pick(e);
    if (v == null) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === Infinity) return fallback;
  const flo = Math.floor(lo / step) * step;
  const fhi = Math.ceil(hi / step) * step;
  return [flo, fhi > flo ? fhi : flo + step];
}
