/* Bracket reconstruction — pure domain.
 *
 * DDD role: Domain Service. Given the flat list of fixtures from the
 * Knockout phase, builds a mirrored bracket layout (R16 → QF → SF |
 * Final | SF ← QF ← R16, plus the 3rd-place match). Walks the tree
 * from the Final backwards, using the rule "a team advances if it
 * appears in any next-round fixture". That makes the mapping
 * deterministic without depending on Sportmonks home/away tagging,
 * which is arbitrary at neutral venues.
 *
 * Zero I/O — only takes the fixtures array. The UI just renders the
 * resulting structure. */

import type { Fixture } from "./fixture";

export interface BracketLayout {
  r16_left: (Fixture | null)[];   // 4, top→bottom
  qf_left: (Fixture | null)[];    // 2, top→bottom
  sf_left: Fixture | null;
  final: Fixture | null;
  sf_right: Fixture | null;
  qf_right: (Fixture | null)[];   // 2, top→bottom
  r16_right: (Fixture | null)[];  // 4, top→bottom
  third_place: Fixture | null;
}

function compare_by_kickoff(a: Fixture, b: Fixture): number {
  if (!a.date) return 1;
  if (!b.date) return -1;
  return a.date.localeCompare(b.date);
}

export function build_bracket(fixtures: readonly Fixture[]): BracketLayout {
  const r16 = fixtures.filter(f => f.stage_name === "Round of 16").slice().sort(compare_by_kickoff);
  const qf = fixtures.filter(f => f.stage_name === "Quarter-finals").slice().sort(compare_by_kickoff);
  const sf = fixtures.filter(f => f.stage_name === "Semi-finals").slice().sort(compare_by_kickoff);
  const final = fixtures.find(f => f.stage_name === "Final") ?? null;
  const third_place = fixtures.find(f => f.stage_name === "3rd Place Final") ?? null;

  const qf_teams = new Set(qf.flatMap(m => [m.home_team_id, m.away_team_id]));
  const sf_teams = new Set(sf.flatMap(m => [m.home_team_id, m.away_team_id]));
  const final_teams = new Set(final ? [final.home_team_id, final.away_team_id] : []);

  const winner_for = (fx: Fixture, next_teams: Set<string>): string | null => {
    if (next_teams.has(fx.home_team_id)) return fx.home_team_id;
    if (next_teams.has(fx.away_team_id)) return fx.away_team_id;
    return null;
  };

  const r16_winners = r16.map(m => winner_for(m, qf_teams));
  const qf_winners = qf.map(m => winner_for(m, sf_teams));
  const sf_winners = sf.map(m => winner_for(m, final_teams));

  let sf_left: Fixture | null = null;
  let sf_right: Fixture | null = null;
  if (final) {
    const idx_l = sf.findIndex((_, i) => sf_winners[i] === final.home_team_id);
    const idx_r = sf.findIndex((_, i) => sf_winners[i] === final.away_team_id);
    sf_left = idx_l >= 0 ? sf[idx_l]! : null;
    sf_right = idx_r >= 0 ? sf[idx_r]! : null;
  } else {
    sf_left = sf[0] ?? null;
    sf_right = sf[1] ?? null;
  }

  const qf_pair_for = (sf_match: Fixture | null): (Fixture | null)[] => {
    if (!sf_match) return [null, null];
    const pair = qf
      .filter((_, i) => qf_winners[i] === sf_match.home_team_id || qf_winners[i] === sf_match.away_team_id)
      .sort(compare_by_kickoff);
    return [pair[0] ?? null, pair[1] ?? null];
  };

  const r16_pair_for = (qf_match: Fixture | null): (Fixture | null)[] => {
    if (!qf_match) return [null, null];
    const pair = r16
      .filter((_, i) => r16_winners[i] === qf_match.home_team_id || r16_winners[i] === qf_match.away_team_id)
      .sort(compare_by_kickoff);
    return [pair[0] ?? null, pair[1] ?? null];
  };

  const qf_left = qf_pair_for(sf_left);
  const qf_right = qf_pair_for(sf_right);
  const r16_left = [...r16_pair_for(qf_left[0]), ...r16_pair_for(qf_left[1])];
  const r16_right = [...r16_pair_for(qf_right[0]), ...r16_pair_for(qf_right[1])];

  return { r16_left, qf_left, sf_left, final, sf_right, qf_right, r16_right, third_place };
}
