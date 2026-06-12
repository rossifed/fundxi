/* player_match_view — pure view-model for a player's per-match event badges.
 *
 * DDD role: Domain Service (pure function). Turns a PlayerMatchEntry's stat
 * line (goals/assists/cards, sourced from core.match_event) into the discrete
 * event badges to show on a fixture row. Shared by web and mobile so both
 * render the same badges (parity); each client maps `kind` to its own icon.
 *
 * Only real, provider-sourced events appear — a count of 0 yields no badge.
 * Per-match aggregate counters (tackles, passes…) are NOT events; they belong
 * to the Statistics panel, not this timeline.
 */

import type { PlayerMatchEntry } from "@fundxi/core/infrastructure/repositories/player_matches_repository";

export type MatchEventKind = "goal" | "assist" | "yellow" | "red";

export interface MatchEventBadge {
  kind: MatchEventKind;
  count: number;
}

export function match_event_badges(m: PlayerMatchEntry): MatchEventBadge[] {
  const badges: MatchEventBadge[] = [];
  if (m.goals > 0) badges.push({ kind: "goal", count: m.goals });
  if (m.assists > 0) badges.push({ kind: "assist", count: m.assists });
  if (m.yellow_cards > 0) badges.push({ kind: "yellow", count: m.yellow_cards });
  if (m.red_cards > 0) badges.push({ kind: "red", count: m.red_cards });
  return badges;
}
