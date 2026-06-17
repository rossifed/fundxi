/* player_stat_view — pure view-model builder for the player Statistics panel.
 *
 * DDD role: Domain Service (pure function, no React, no I/O). Turns a raw
 * PlayerTournamentStat into display-ready groups so web and mobile render the
 * SAME stats, in the SAME order, with the SAME formatting (web-mobile parity is
 * a project invariant). Each client only maps `semantic` to its own colour
 * tokens — no presentation logic is duplicated.
 *
 * Layout is FIXED: every family and every KPI is always emitted, so the grid
 * looks the same for every player.
 *
 * Absence semantics (verified against the Sportmonks WC2026 feed: across every
 * player who featured, NO statistic detail is ever sent with total == 0 — the
 * provider OMITS zero counting stats):
 *  - if the player HAS featured (appearances/minutes present), an absent
 *    COUNTING stat means it simply didn't happen → render "0". This reads the
 *    provider's sparse encoding; it is NOT fabricated data.
 *  - if the player has NOT featured (no appearances/minutes), every value is
 *    absent → render "—".
 *  - rating and pass-accuracy are NOT counts (an average / a percentage). When
 *    absent they render "—" even for a player who featured — a 0.0 rating or
 *    "0%" would misrepresent "no value", so we never synthesise one.
 */

import type { Position } from "@fundxi/core/domain/player/player";
import type { PlayerTournamentStat } from "@fundxi/core/infrastructure/repositories/player_stats_repository";

export type StatSemantic = "neutral" | "good" | "warn" | "danger";

export interface StatItem {
  label: string;
  value: string;
  semantic: StatSemantic;
  /** Optional disambiguation for compact ratios (e.g. "2 on target / 5 total"). */
  title?: string;
  /** Optional multi-coloured value: render span-by-span, each with its own
   *  semantic colour (e.g. yellow/red cards). When present it takes precedence
   *  over `value`; `value` stays as a plain-text fallback. */
  parts?: { text: string; semantic: StatSemantic }[];
}

export interface StatGroup {
  title: string;
  items: StatItem[];
}

type Num = number | null;

const present = (v: Num): v is number => v !== null && v !== undefined;
const num = (v: Num): string => (present(v) ? String(v) : "—");
/** "good" when there is a real positive value; neutral otherwise (incl. absent). */
const pos = (v: Num): StatSemantic => (present(v) && v > 0 ? "good" : "neutral");

/** A "x/y" ratio. Absent both sides → "0/0" if the player featured (a real
 *  zero), else "—". A present side fills the missing one with 0. */
function ratio(made: Num, attempted: Num, played: boolean): { value: string; title?: string } {
  if (!present(made) && !present(attempted) && !played) return { value: "—" };
  return { value: `${made ?? 0}/${attempted ?? 0}`, title: `${made ?? 0} of ${attempted ?? 0}` };
}

export function build_tournament_stat_groups(s: PlayerTournamentStat): StatGroup[] {
  const kpi = (label: string, value: string, semantic: StatSemantic = "neutral", title?: string): StatItem => ({
    label,
    value,
    semantic,
    title,
  });

  // Has the player featured? Then an absent counting stat is a real 0, not
  // "unknown" (Sportmonks omits zero counting stats — verified on the feed).
  const played = present(s.appearances) || present(s.minutes_played);
  // Counting stat: the value, else "0" when the player featured, else "—".
  const count = (v: Num): string => (present(v) ? String(v) : played ? "0" : "—");

  const shots = ratio(s.shots_on_target, s.shots_total, played);
  const crosses = ratio(s.crosses_accurate, s.crosses_total, played);
  const dribbles = ratio(s.dribbles_completed, s.dribble_attempts, played);
  const duels = ratio(s.duels_won, s.total_duels, played);

  return [
    {
      title: "Overview",
      // Apps/Min/Rating are NOT counting stats — they define "played" or are an
      // average. Absent ⇒ "—" (the player simply hasn't featured / no rating).
      items: [
        kpi("Apps", num(s.appearances)),
        kpi("Min", num(s.minutes_played)),
        kpi("Rating", present(s.rating_avg) ? s.rating_avg.toFixed(1) : "—"),
      ],
    },
    {
      title: "Attacking",
      items: [
        kpi("Goals", count(s.goals), pos(s.goals)),
        kpi("Assists", count(s.assists), pos(s.assists)),
        kpi("Shots OT/Tot", shots.value, "neutral", shots.title),
        kpi("Shots off T", count(s.shots_off_target)),
        kpi("Big Chances", count(s.big_chances_created), pos(s.big_chances_created)),
        kpi("BC Missed", count(s.big_chances_missed), "neutral", "Big chances missed"),
        kpi("Offsides", count(s.offsides)),
      ],
    },
    {
      title: "Passing",
      items: [
        kpi("Passes", count(s.passes_total)),
        // Pass % is a percentage, not a count: absent ⇒ "—" (never "0%").
        kpi("Pass %", present(s.passes_accuracy) ? `${s.passes_accuracy.toFixed(0)}%` : "—"),
        kpi("Accurate", count(s.accurate_passes)),
        kpi("Key Passes", count(s.key_passes), pos(s.key_passes)),
        kpi("Crosses A/T", crosses.value, "neutral", crosses.title),
        kpi("Long Balls", count(s.long_balls)),
        kpi("Through Balls", count(s.through_balls)),
      ],
    },
    {
      title: "Dribbling",
      items: [
        kpi("Dribbles", dribbles.value, "neutral", dribbles.title),
        kpi("Dispossessed", count(s.dispossessed)),
        kpi("Dribbled Past", count(s.dribbled_past)),
        kpi("Fouls Won", count(s.fouls_drawn)),
      ],
    },
    {
      title: "Defending",
      items: [
        kpi("Tackles", count(s.tackles)),
        kpi("Intercept.", count(s.interceptions)),
        kpi("Clearances", count(s.clearances)),
        kpi("Duels W/T", duels.value, "neutral", duels.title),
        kpi("Aerials Won", count(s.aerials_won)),
        kpi("Blocks", count(s.shots_blocked)),
        kpi(
          "Errors",
          count(s.errors_leading_to_goal),
          present(s.errors_leading_to_goal) && s.errors_leading_to_goal > 0 ? "warn" : "neutral",
          "Errors leading to a goal",
        ),
      ],
    },
    {
      title: "Discipline",
      items: [
        kpi("Fouls", count(s.fouls)),
        kpi("Yellow", count(s.yellow_cards), present(s.yellow_cards) && s.yellow_cards > 0 ? "warn" : "neutral"),
        kpi("Red", count(s.red_cards), present(s.red_cards) && s.red_cards > 0 ? "danger" : "neutral"),
        kpi("Own Goals", count(s.own_goals), present(s.own_goals) && s.own_goals > 0 ? "danger" : "neutral"),
      ],
    },
    {
      title: "Goalkeeping",
      items: [
        kpi("Saves", count(s.saves), pos(s.saves)),
        kpi("Conceded", count(s.goals_conceded)),
        kpi("Clean Sheets", count(s.clean_sheets), pos(s.clean_sheets)),
      ],
    },
  ];
}

/* key_tournament_stats — the compact "headline" row of tournament totals shown
 * just below the player's personal/bio block (a tight strip, NOT the full
 * Statistics panel). Same source, formatting and absence rules as
 * build_tournament_stat_groups, so web and mobile render the SAME six cells.
 * Cards are folded into one "yellow/red" cell to keep the strip compact.
 *
 * Position-aware: a goalkeeper shows Saves / Conceded instead of Goals /
 * Assists (a keeper normally neither scores nor assists). */
export function key_tournament_stats(
  s: PlayerTournamentStat | null | undefined,
  position: Position,
): StatItem[] {
  const is_gk = position === "GK";
  const kpi = (label: string, value: string, semantic: StatSemantic = "neutral", title?: string): StatItem => ({
    label,
    value,
    semantic,
    title,
  });
  if (!s) {
    return [
      kpi("Min", "—"),
      kpi("Rating", "—"),
      kpi(is_gk ? "Saves" : "Goals", "—"),
      kpi(is_gk ? "Conceded" : "Assists", "—"),
      kpi("Cards", "—", "neutral", "Yellow / Red"),
      kpi("Pass %", "—"),
    ];
  }
  const played = present(s.appearances) || present(s.minutes_played);
  const count = (v: Num): string => (present(v) ? String(v) : played ? "0" : "—");
  const y = s.yellow_cards;
  const r = s.red_cards;
  const cards_known = present(y) || present(r) || played;
  // Yellow count in the yellow-card colour, red count in red; "—" when the
  // player hasn't featured (no colour split then).
  const cards: StatItem = {
    label: "Cards",
    value: cards_known ? `${y ?? 0}/${r ?? 0}` : "—",
    semantic: (r ?? 0) > 0 ? "danger" : (y ?? 0) > 0 ? "warn" : "neutral",
    title: "Yellow / Red",
    parts: cards_known
      ? [
          { text: String(y ?? 0), semantic: "warn" },
          { text: "/", semantic: "neutral" },
          { text: String(r ?? 0), semantic: "danger" },
        ]
      : undefined,
  };
  return [
    kpi("Min", num(s.minutes_played)),
    kpi("Rating", present(s.rating_avg) ? s.rating_avg.toFixed(1) : "—"),
    is_gk ? kpi("Saves", count(s.saves), pos(s.saves)) : kpi("Goals", count(s.goals), pos(s.goals)),
    is_gk ? kpi("Conceded", count(s.goals_conceded)) : kpi("Assists", count(s.assists), pos(s.assists)),
    cards,
    kpi("Pass %", present(s.passes_accuracy) ? `${s.passes_accuracy.toFixed(0)}%` : "—"),
  ];
}
