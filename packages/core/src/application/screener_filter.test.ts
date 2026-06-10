import { describe, expect, it } from "vitest";
import {
  filter_screener_entries,
  screener_bounds,
  sort_screener_entries,
  type ScreenerCriteria,
} from "./screener_filter";
import type { ScreenerEntry } from "../infrastructure/repositories/screener_repository";

const entry = (over: Partial<ScreenerEntry> & { id: number }): ScreenerEntry => ({
  name: `P${over.id}`,
  full_name: null,
  jersey_number: 9,
  team_id: "ARG",
  position: "FW",
  detailed_position: null,
  age: 25,
  foot: null,
  height: null,
  weight: null,
  club: null,
  image_path: null,
  current_price: 50,
  performance_rating: 7,
  valuation_as_of: "2026-06-09T00:00:00Z",
  valuation_source: "engine",
  since_start_pct: 0,
  last_match_pct: null,
  avg_match_pct: null,
  appearances: null,
  minutes_played: null,
  goals: null,
  assists: null,
  yellow_cards: null,
  red_cards: null,
  shots_total: null,
  shots_on_target: null,
  key_passes: null,
  passes_total: null,
  passes_accuracy: null,
  rating_avg: null,
  held_shares: 0,
  average_buy_price: null,
  pnl: null,
  ...over,
});

const ids = (entries: ScreenerEntry[]): number[] => entries.map(e => e.id);

describe("filter_screener_entries — filters", () => {
  const dataset = [
    entry({ id: 1, position: "FW", team_id: "ARG", current_price: 90, since_start_pct: 40, age: 22, held_shares: 3 }),
    entry({ id: 2, position: "GK", team_id: "FRA", current_price: 30, since_start_pct: -10, age: 31, held_shares: 0 }),
    entry({ id: 3, position: "FW", team_id: "FRA", current_price: 60, since_start_pct: 5, age: 28, held_shares: 0 }),
  ];

  it("empty criteria returns every entry (default sort by value desc)", () => {
    expect(ids(filter_screener_entries(dataset, {}))).toEqual([1, 3, 2]);
  });

  it("filters by position set", () => {
    expect(ids(filter_screener_entries(dataset, { positions: new Set(["FW"]) }))).toEqual([1, 3]);
  });

  it("filters by team set", () => {
    expect(ids(filter_screener_entries(dataset, { team_ids: new Set(["FRA"]) }))).toEqual([3, 2]);
  });

  it("price_range is inclusive; null range is inactive", () => {
    expect(ids(filter_screener_entries(dataset, { price_range: [30, 60] }))).toEqual([3, 2]);
    expect(ids(filter_screener_entries(dataset, { price_range: null }))).toEqual([1, 3, 2]);
  });

  it("perf_range filters on since_start_pct", () => {
    expect(ids(filter_screener_entries(dataset, { perf_range: [0, 100] }))).toEqual([1, 3]);
  });

  it("a null attribute fails an active range (not silently kept)", () => {
    const data = [entry({ id: 9, since_start_pct: null })];
    expect(filter_screener_entries(data, { perf_range: [-50, 50] })).toHaveLength(0);
  });

  it("age_range filters on age", () => {
    expect(ids(filter_screener_entries(dataset, { age_range: [21, 25] }))).toEqual([1]);
  });

  it("held_only keeps entries in the supplied held set (same source as the badge)", () => {
    const out = filter_screener_entries(dataset, { held_only: true }, { held_ids: new Set([1]) });
    expect(ids(out)).toEqual([1]);
  });

  it("held_only with no held context keeps nothing", () => {
    expect(filter_screener_entries(dataset, { held_only: true })).toHaveLength(0);
  });

  it("watch_only keeps entries in the supplied watchlist", () => {
    const out = filter_screener_entries(dataset, { watch_only: true }, { watched_ids: new Set([3]) });
    expect(ids(out)).toEqual([3]);
  });

  it("watch_only with no watchlist context keeps nothing", () => {
    expect(filter_screener_entries(dataset, { watch_only: true })).toHaveLength(0);
  });
});

describe("filter_screener_entries — search", () => {
  const data = [
    entry({ id: 1, name: "Messi", club: "Inter Miami", team_id: "ARG" }),
    entry({ id: 2, name: "Mbappé", full_name: "Kylian Mbappé", club: "Real Madrid", team_id: "FRA" }),
  ];
  const ctx = { team_name: (t: string) => ({ ARG: "Argentina", FRA: "France" })[t] };

  it("matches on name", () => {
    expect(ids(filter_screener_entries(data, { search: "mess" }, ctx))).toEqual([1]);
  });
  it("matches on club", () => {
    expect(ids(filter_screener_entries(data, { search: "madrid" }, ctx))).toEqual([2]);
  });
  it("matches on resolved team name", () => {
    expect(ids(filter_screener_entries(data, { search: "argentina" }, ctx))).toEqual([1]);
  });
  it("matches on full_name", () => {
    expect(ids(filter_screener_entries(data, { search: "kylian" }, ctx))).toEqual([2]);
  });
  it("trims and is case-insensitive", () => {
    expect(ids(filter_screener_entries(data, { search: "  MESSI " }, ctx))).toEqual([1]);
  });
});

describe("sort_screener_entries", () => {
  const data = [
    entry({ id: 1, name: "Charlie", current_price: 10, goals: 2, foot: "left" }),
    entry({ id: 2, name: "alice", current_price: 30, goals: null, foot: "right" }),
    entry({ id: 3, name: "Bob", current_price: 20, goals: 5, foot: null }),
  ];

  it("numeric desc / asc", () => {
    expect(ids(sort_screener_entries(data, "value", "desc"))).toEqual([2, 3, 1]);
    expect(ids(sort_screener_entries(data, "value", "asc"))).toEqual([1, 3, 2]);
  });

  it("string key uses case-insensitive locale order", () => {
    expect(ids(sort_screener_entries(data, "name", "asc"))).toEqual([2, 3, 1]); // alice, Bob, Charlie
  });

  it("nulls sort last regardless of direction", () => {
    expect(ids(sort_screener_entries(data, "goals", "desc"))).toEqual([3, 1, 2]);
    expect(ids(sort_screener_entries(data, "goals", "asc"))).toEqual([1, 3, 2]);
  });

  it("supports the web-only keys (foot) without dropping them", () => {
    // foot present on 1 (left) & 2 (right); 3 is null → last.
    expect(ids(sort_screener_entries(data, "foot", "asc"))).toEqual([1, 2, 3]);
  });

  it("does not mutate the input array", () => {
    const before = ids(data);
    sort_screener_entries(data, "value", "asc");
    expect(ids(data)).toEqual(before);
  });
});

describe("screener_bounds", () => {
  it("snaps lo down and hi up to the step", () => {
    const data = [entry({ id: 1, current_price: 12 }), entry({ id: 2, current_price: 73 })];
    expect(screener_bounds(data, e => e.current_price, 5, [0, 100])).toEqual([10, 75]);
  });

  it("falls back when no entry carries the attribute", () => {
    const data = [entry({ id: 1, age: null })];
    expect(screener_bounds(data, e => e.age, 1, [16, 45])).toEqual([16, 45]);
  });

  it("guarantees hi > lo by widening one step when all values are equal", () => {
    const data = [entry({ id: 1, current_price: 20 }), entry({ id: 2, current_price: 20 })];
    expect(screener_bounds(data, e => e.current_price, 5, [0, 100])).toEqual([20, 25]);
  });
});
