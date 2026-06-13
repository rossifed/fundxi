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

import type { PlayerTournamentStat } from "@fundxi/core/infrastructure/repositories/player_stats_repository";

export type StatSemantic = "neutral" | "good" | "warn" | "danger";

export interface StatItem {
  label: string;
  value: string;
  semantic: StatSemantic;
  /** Optional disambiguation for compact ratios (e.g. "2 on target / 5 total"). */
  title?: string;
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
      ],
    },
    {
      title: "Discipline",
      items: [
        kpi("Fouls", count(s.fouls)),
        kpi("Yellow", count(s.yellow_cards), present(s.yellow_cards) && s.yellow_cards > 0 ? "warn" : "neutral"),
        kpi("Red", count(s.red_cards), present(s.red_cards) && s.red_cards > 0 ? "danger" : "neutral"),
      ],
    },
    {
      title: "Goalkeeping",
      items: [kpi("Saves", count(s.saves), pos(s.saves)), kpi("Conceded", count(s.goals_conceded))],
    },
  ];
}
