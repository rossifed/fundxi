/* player_stat_view — pure view-model builder for the player Statistics panel.
 *
 * DDD role: Domain Service (pure function, no React, no I/O). Turns a raw
 * PlayerTournamentStat into display-ready groups so web and mobile render the
 * SAME stats, in the SAME order, with the SAME formatting (web-mobile parity is
 * a project invariant). Each client only maps `semantic` to its own colour
 * tokens — no presentation logic is duplicated.
 *
 * Sourcing rule: a KPI is emitted ONLY when its provider value is non-null.
 * A goalkeeper shows Saves/Conceded; an outfielder doesn't. A group with no
 * present KPI is dropped. We never fabricate a "0" for a stat the provider
 * didn't send (0 is shown only when the provider actually reports 0).
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
const pos = (v: Num): StatSemantic => (present(v) && v > 0 ? "good" : "neutral");

/** A "x/y" ratio shown when EITHER side is present (missing side renders 0). */
function ratio(made: Num, attempted: Num): { value: string; title: string } | null {
  if (!present(made) && !present(attempted)) return null;
  return { value: `${made ?? 0}/${attempted ?? 0}`, title: `${made ?? 0} of ${attempted ?? 0}` };
}

export function build_tournament_stat_groups(s: PlayerTournamentStat): StatGroup[] {
  const groups: StatGroup[] = [];
  const push = (title: string, items: (StatItem | null)[]) => {
    const present_items = items.filter((i): i is StatItem => i !== null);
    if (present_items.length > 0) groups.push({ title, items: present_items });
  };
  const kpi = (label: string, v: Num, semantic: StatSemantic = "neutral"): StatItem | null =>
    present(v) ? { label, value: String(v), semantic } : null;

  // Overview
  push("Overview", [
    kpi("Apps", s.appearances),
    kpi("Min", s.minutes_played),
    s.rating_avg !== null ? { label: "Rating", value: s.rating_avg.toFixed(1), semantic: "neutral" } : null,
  ]);

  // Attacking / shooting
  const shots = ratio(s.shots_on_target, s.shots_total);
  push("Attacking", [
    kpi("Goals", s.goals, pos(s.goals)),
    kpi("Assists", s.assists, pos(s.assists)),
    shots ? { label: "Shots OT/Tot", value: shots.value, semantic: "neutral", title: shots.title } : null,
    kpi("Shots off T", s.shots_off_target),
    kpi("Big Chances", s.big_chances_created, pos(s.big_chances_created)),
    kpi("Offsides", s.offsides),
  ]);

  // Passing / creation
  const crosses = ratio(s.crosses_accurate, s.crosses_total);
  push("Passing", [
    kpi("Passes", s.passes_total),
    s.passes_accuracy !== null
      ? { label: "Pass %", value: `${s.passes_accuracy.toFixed(0)}%`, semantic: "neutral" }
      : null,
    kpi("Accurate", s.accurate_passes),
    kpi("Key Passes", s.key_passes, pos(s.key_passes)),
    crosses ? { label: "Crosses A/T", value: crosses.value, semantic: "neutral", title: crosses.title } : null,
    kpi("Long Balls", s.long_balls),
    kpi("Through Balls", s.through_balls),
  ]);

  // Dribble / take-on
  const dribbles = ratio(s.dribbles_completed, s.dribble_attempts);
  push("Dribbling", [
    dribbles ? { label: "Dribbles", value: dribbles.value, semantic: "neutral", title: dribbles.title } : null,
    kpi("Dispossessed", s.dispossessed),
    kpi("Dribbled Past", s.dribbled_past),
    kpi("Fouls Won", s.fouls_drawn),
  ]);

  // Defence / duels
  const duels = ratio(s.duels_won, s.total_duels);
  push("Defending", [
    kpi("Tackles", s.tackles),
    kpi("Intercept.", s.interceptions),
    kpi("Clearances", s.clearances),
    duels ? { label: "Duels W/T", value: duels.value, semantic: "neutral", title: duels.title } : null,
    kpi("Aerials Won", s.aerials_won),
    kpi("Blocks", s.shots_blocked),
  ]);

  // Discipline
  push("Discipline", [
    kpi("Fouls", s.fouls),
    kpi("Yellow", s.yellow_cards, present(s.yellow_cards) && s.yellow_cards > 0 ? "warn" : "neutral"),
    kpi("Red", s.red_cards, present(s.red_cards) && s.red_cards > 0 ? "danger" : "neutral"),
  ]);

  // Goalkeeping (only present for keepers)
  push("Goalkeeping", [kpi("Saves", s.saves, pos(s.saves)), kpi("Conceded", s.goals_conceded)]);

  return groups;
}
