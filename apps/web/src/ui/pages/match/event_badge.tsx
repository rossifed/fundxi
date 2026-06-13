/* Match-event indicators (goal / cards) shared by Pitch + List views.
 *
 * The same factual data (a goal, a yellow / red card) must look the
 * same wherever it appears on the same screen — pitch token, roster
 * row, anywhere else later. Centralising the icon rules AND the
 * counting helper here makes that coherence structural: both surfaces
 * import the same things, so they cannot drift.
 *
 * Event ``type`` arrives from the BFF as an emoji glyph (see
 * fixtures router _TYPE_LABEL): "⚽" / "🎯" for goals & penalties
 * (own goals also map to "⚽"), "🟨" yellow, "🟥" red (incl. yellow-
 * then-red). We deliberately reuse the provider's own glyph mapping
 * end-to-end — no parallel taxonomy.
 */

import type { CSSProperties } from "react";
import type { MatchEvent } from "@fundxi/core/domain/match/match";
import type { SubInfo } from "@fundxi/core/domain/match/substitutions";

export interface MatchEventCounts {
  goals: number;
  own_goals: number;
  yellow: number;
  red: number;
}

/** Tally goals + cards per player from the real match events feed. Own goals
 * are kept apart from normal goals (`own_goals`) so the scorer is NOT credited
 * with a goal for his team. Returns an empty map when there are no events. */
export function count_match_events(events: MatchEvent[]): Map<number, MatchEventCounts> {
  const m = new Map<number, MatchEventCounts>();
  for (const ev of events) {
    if (!ev.player_id) continue;
    const c = m.get(ev.player_id) ?? { goals: 0, own_goals: 0, yellow: 0, red: 0 };
    if (ev.is_own_goal) c.own_goals += 1;
    else if (ev.type === "⚽" || ev.type === "🎯") c.goals += 1;
    else if (ev.type === "🟨") c.yellow += 1;
    else if (ev.type === "🟥") c.red += 1;
    m.set(ev.player_id, c);
  }
  return m;
}

interface MatchEventBadgeProps {
  events: MatchEventCounts | undefined;
  /** ``corner`` mounts a small absolute-positioned overlay on an avatar
   * (used by PitchView tokens). ``inline`` mounts a flat row next to
   * the player name (used by the list / RosterCard view). */
  variant: "corner" | "inline";
}

const _base_style: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
  fontSize: 11,
  background: "#0b0f14",
  color: "rgba(255,255,255,.95)",
  borderRadius: 8,
  padding: "2px 5px",
  border: "1px solid rgba(255,255,255,.25)",
  lineHeight: 1.2,
};

/** A compact icon row: 🟥/🟨 then ⚽×N. Nothing renders when the player
 * has no event yet. Same icons, same order, same title format on every
 * surface — coherence by construction. */
export function MatchEventBadge({ events, variant }: MatchEventBadgeProps) {
  if (!events || (events.goals === 0 && events.own_goals === 0 && events.yellow === 0 && events.red === 0))
    return null;
  const style: CSSProperties =
    variant === "corner"
      ? { ..._base_style, position: "absolute", top: -4, left: -6 }
      : _base_style;
  const title = [
    events.goals ? `${events.goals} goal${events.goals > 1 ? "s" : ""}` : null,
    events.own_goals ? `${events.own_goals} own goal${events.own_goals > 1 ? "s" : ""}` : null,
    events.yellow ? "yellow card" : null,
    events.red ? "red card" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span style={style} title={title}>
      {events.red > 0 ? "🟥" : events.yellow > 0 ? "🟨" : null}
      {events.goals > 0 ? (events.goals === 1 ? "⚽" : `⚽×${events.goals}`) : null}
      {events.own_goals > 0 ? (
        <>
          ⚽
          <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.7, marginLeft: 1 }}>
            (og){events.own_goals > 1 ? `×${events.own_goals}` : ""}
          </span>
        </>
      ) : null}
    </span>
  );
}

interface SubBadgeProps {
  sub: SubInfo | undefined;
  variant: "corner" | "inline";
}

/** Football-standard substitution mark: green ▲ for "subbed on",
 * red ▼ for "subbed off", with the minute in mono. Convention used
 * by FotMob, BBC Sport, OneFootball, etc. — no emoji. Same dark chip
 * base as MatchEventBadge so the two read as a coherent family on
 * the same row / corner. Tooltip carries the partner name. */
export function SubBadge({ sub, variant }: SubBadgeProps) {
  if (!sub) return null;
  const style: CSSProperties =
    variant === "corner"
      // Bottom-left so it doesn't collide with the jersey badge
      // (bottom-right) nor with MatchEventBadge (top-left).
      ? { ..._base_style, position: "absolute", bottom: -4, left: -6 }
      : _base_style;
  const is_on = sub.direction === "on";
  const arrow = is_on ? "▲" : "▼";
  const arrow_color = is_on ? "var(--color-positive)" : "var(--color-negative)";
  const minute_label = sub.extra_minute ? `${sub.minute}+${sub.extra_minute}'` : `${sub.minute}'`;
  const title = [
    is_on ? "subbed on" : "subbed off",
    sub.partner_name ? `for ${sub.partner_name}` : null,
    `at ${minute_label}`,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span style={style} title={title}>
      <span style={{ color: arrow_color, fontWeight: 800 }}>{arrow}</span>
      <span className="mono" style={{ marginLeft: 3, fontSize: 10 }}>{minute_label}</span>
    </span>
  );
}
