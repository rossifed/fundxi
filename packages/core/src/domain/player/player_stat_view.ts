/* player_stat_view — pure view-model builder for the player Statistics panel.
 *
 * DDD role: Domain Service (pure function, no React, no I/O). Turns a raw
 * PlayerTournamentStat into display-ready groups so web and mobile render the
 * SAME stats, in the SAME order, with the SAME formatting (web-mobile parity is
 * a project invariant). Each client only maps `semantic` to its own colour
 * tokens — no presentation logic is duplicated.
 *
 * Layout is FIXED: every family and every KPI is always emitted, so the grid
 * looks the same for every player. A missing provider value renders as "—"
 * (an explicit absence marker — NOT fabricated data; we never invent a number).
 * A real 0 from the provider shows as "0".
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

/** A "x/y" ratio; "—" when BOTH sides are absent, else fills a missing side with 0. */
function ratio(made: Num, attempted: Num): { value: string; title?: string } {
  if (!present(made) && !present(attempted)) return { value: "—" };
  return { value: `${made ?? 0}/${attempted ?? 0}`, title: `${made ?? 0} of ${attempted ?? 0}` };
}

export function build_tournament_stat_groups(s: PlayerTournamentStat): StatGroup[] {
  const kpi = (label: string, value: string, semantic: StatSemantic = "neutral", title?: string): StatItem => ({
    label,
    value,
    semantic,
    title,
  });

  const shots = ratio(s.shots_on_target, s.shots_total);
  const crosses = ratio(s.crosses_accurate, s.crosses_total);
  const dribbles = ratio(s.dribbles_completed, s.dribble_attempts);
  const duels = ratio(s.duels_won, s.total_duels);

  return [
    {
      title: "Overview",
      items: [
        kpi("Apps", num(s.appearances)),
        kpi("Min", num(s.minutes_played)),
        kpi("Rating", present(s.rating_avg) ? s.rating_avg.toFixed(1) : "—"),
      ],
    },
    {
      title: "Attacking",
      items: [
        kpi("Goals", num(s.goals), pos(s.goals)),
        kpi("Assists", num(s.assists), pos(s.assists)),
        kpi("Shots OT/Tot", shots.value, "neutral", shots.title),
        kpi("Shots off T", num(s.shots_off_target)),
        kpi("Big Chances", num(s.big_chances_created), pos(s.big_chances_created)),
        kpi("Offsides", num(s.offsides)),
      ],
    },
    {
      title: "Passing",
      items: [
        kpi("Passes", num(s.passes_total)),
        kpi("Pass %", present(s.passes_accuracy) ? `${s.passes_accuracy.toFixed(0)}%` : "—"),
        kpi("Accurate", num(s.accurate_passes)),
        kpi("Key Passes", num(s.key_passes), pos(s.key_passes)),
        kpi("Crosses A/T", crosses.value, "neutral", crosses.title),
        kpi("Long Balls", num(s.long_balls)),
        kpi("Through Balls", num(s.through_balls)),
      ],
    },
    {
      title: "Dribbling",
      items: [
        kpi("Dribbles", dribbles.value, "neutral", dribbles.title),
        kpi("Dispossessed", num(s.dispossessed)),
        kpi("Dribbled Past", num(s.dribbled_past)),
        kpi("Fouls Won", num(s.fouls_drawn)),
      ],
    },
    {
      title: "Defending",
      items: [
        kpi("Tackles", num(s.tackles)),
        kpi("Intercept.", num(s.interceptions)),
        kpi("Clearances", num(s.clearances)),
        kpi("Duels W/T", duels.value, "neutral", duels.title),
        kpi("Aerials Won", num(s.aerials_won)),
        kpi("Blocks", num(s.shots_blocked)),
      ],
    },
    {
      title: "Discipline",
      items: [
        kpi("Fouls", num(s.fouls)),
        kpi("Yellow", num(s.yellow_cards), present(s.yellow_cards) && s.yellow_cards > 0 ? "warn" : "neutral"),
        kpi("Red", num(s.red_cards), present(s.red_cards) && s.red_cards > 0 ? "danger" : "neutral"),
      ],
    },
    {
      title: "Goalkeeping",
      items: [kpi("Saves", num(s.saves), pos(s.saves)), kpi("Conceded", num(s.goals_conceded))],
    },
  ];
}
