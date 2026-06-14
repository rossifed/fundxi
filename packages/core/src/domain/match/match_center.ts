// Domain Service (pure): what the Home "Match Center" surfaces.
//
// The card shows a persistent live match (handled by the UI) plus a
// Next | Latest toggle. These helpers pick the two lists and the default
// tab. Pure functions over the already-loaded fixtures list — no I/O, and
// `now_ms` is injected so the default is deterministic and testable.

import type { Fixture } from "./fixture";

export type MatchTab = "next" | "latest";

// A finished match counts as "fresh" (worth defaulting to) for this long after
// its kickoff — covers the wake-up case (overnight / earlier-today results)
// without latching onto a result from a previous rest day.
export const RECENT_RESULT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The most recently played matches, newest first. */
export function latest_results(fixtures: readonly Fixture[], limit: number): Fixture[] {
  return fixtures
    .filter(f => f.status === "finished")
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, limit);
}

/** The soonest upcoming matches, earliest first. */
export function next_fixtures(fixtures: readonly Fixture[], limit: number): Fixture[] {
  return fixtures
    .filter(f => f.status === "upcoming")
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .slice(0, limit);
}

/**
 * Which tab to open on first render. "latest" when the most recent result is
 * within RECENT_RESULT_WINDOW_MS of `now_ms` (you just woke up to fresh
 * scores), otherwise "next". Degenerate cases: no results → "next"; results
 * but nothing upcoming → "latest".
 */
export function default_match_tab(fixtures: readonly Fixture[], now_ms: number): MatchTab {
  const last = latest_results(fixtures, 1)[0];
  if (!last) return "next";
  if (!fixtures.some(f => f.status === "upcoming")) return "latest";
  const last_ms = last.date ? Date.parse(last.date) : Number.NaN;
  if (Number.isNaN(last_ms)) return "next";
  return now_ms - last_ms < RECENT_RESULT_WINDOW_MS ? "latest" : "next";
}
