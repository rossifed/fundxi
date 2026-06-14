import { describe, expect, it } from "vitest";
import type { Fixture } from "./fixture";
import { default_match_tab, latest_results, next_fixtures, RECENT_RESULT_WINDOW_MS } from "./match_center";

const NOW = Date.parse("2026-06-14T09:00:00Z");

function fx(id: number, status: Fixture["status"], date: string): Fixture {
  return { id, home_team_id: `H${id}`, away_team_id: `A${id}`, status, group: "A", date };
}

describe("latest_results", () => {
  it("keeps only finished matches, newest first, capped to the limit", () => {
    const fixtures = [
      fx(1, "finished", "2026-06-12T19:00:00Z"),
      fx(2, "upcoming", "2026-06-20T19:00:00Z"),
      fx(3, "finished", "2026-06-14T01:00:00Z"),
      fx(4, "finished", "2026-06-13T16:00:00Z"),
      fx(5, "live", "2026-06-14T08:00:00Z"),
    ];
    expect(latest_results(fixtures, 2).map(f => f.id)).toEqual([3, 4]);
  });
});

describe("next_fixtures", () => {
  it("keeps only upcoming matches, soonest first, capped to the limit", () => {
    const fixtures = [
      fx(1, "upcoming", "2026-06-22T19:00:00Z"),
      fx(2, "finished", "2026-06-10T19:00:00Z"),
      fx(3, "upcoming", "2026-06-15T13:00:00Z"),
      fx(4, "upcoming", "2026-06-18T16:00:00Z"),
    ];
    expect(next_fixtures(fixtures, 2).map(f => f.id)).toEqual([3, 4]);
  });
});

describe("default_match_tab", () => {
  it("opens 'next' when there are no results", () => {
    expect(default_match_tab([fx(1, "upcoming", "2026-06-20T19:00:00Z")], NOW)).toBe("next");
  });

  it("opens 'latest' when the freshest result is within the recent window (wake-up case)", () => {
    const overnight = fx(1, "finished", "2026-06-14T01:00:00Z"); // ~8h before NOW
    expect(default_match_tab([overnight, fx(2, "upcoming", "2026-06-18T19:00:00Z")], NOW)).toBe("latest");
  });

  it("opens 'next' when the last result is older than the recent window", () => {
    const stale = fx(1, "finished", new Date(NOW - RECENT_RESULT_WINDOW_MS - 60_000).toISOString());
    expect(default_match_tab([stale, fx(2, "upcoming", "2026-06-18T19:00:00Z")], NOW)).toBe("next");
  });

  it("opens 'latest' when there are results but nothing upcoming", () => {
    const old_result = fx(1, "finished", "2026-05-01T19:00:00Z");
    expect(default_match_tab([old_result], NOW)).toBe("latest");
  });
});
