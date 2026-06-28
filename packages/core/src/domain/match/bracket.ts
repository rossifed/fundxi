/* Bracket reconstruction — pure domain.
 *
 * DDD role: Domain Service. Given the flat list of fixtures from the
 * Knockout phase, builds a mirrored bracket layout (R32 → R16 → QF → SF
 * | Final | SF ← QF ← R16 ← R32, plus the 3rd-place match). Walks the
 * tree from the Final backwards, using the rule "a team advances if it
 * appears in any next-round fixture". That makes the mapping
 * deterministic without depending on Sportmonks home/away tagging,
 * which is arbitrary at neutral venues.
 *
 * The layout always returns fixed-size round arrays (R32: 8+8, R16: 4+4,
 * QF: 2+2, SF: 1+1) padded with nulls, so the UI renders the full bracket
 * SKELETON even before any knockout fixture exists — slots fill in as the
 * tournament resolves. The Round of 32 is the 48-team-format first round
 * (WC2026); it stays all-null for 32-team tournaments that start at R16.
 *
 * Zero I/O — only takes the fixtures array. The UI just renders the
 * resulting structure. */

import type { Fixture } from "./fixture";

export interface BracketLayout {
  r32_left: (Fixture | null)[];   // 8, top→bottom (48-team format; all-null for 32-team)
  r16_left: (Fixture | null)[];   // 4, top→bottom
  qf_left: (Fixture | null)[];    // 2, top→bottom
  sf_left: Fixture | null;
  final: Fixture | null;
  sf_right: Fixture | null;
  qf_right: (Fixture | null)[];   // 2, top→bottom
  r16_right: (Fixture | null)[];  // 4, top→bottom
  r32_right: (Fixture | null)[];  // 8, top→bottom
  third_place: Fixture | null;
}

function compare_by_kickoff(a: Fixture, b: Fixture): number {
  // Both undated → equal (a stable, symmetric comparator); a single undated
  // fixture sorts last.
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return a.date.localeCompare(b.date);
}

/* Drop matches the advancement walk could not anchor — because the round
 * downstream does not exist yet (e.g. the R32 is played but the R16 has not
 * been drawn) — into the still-empty slots, in kickoff order, left side
 * first. Without this a round that is the DEEPEST one yet played renders
 * empty: its winners appear in no next-round fixture, so nothing nests.
 * A no-op once every match is anchored (the full-tree case), so it never
 * disturbs a resolved bracket's topology. */
function fill_unplaced(
  left: (Fixture | null)[],
  right: (Fixture | null)[],
  all: readonly Fixture[],
): [(Fixture | null)[], (Fixture | null)[]] {
  const placed = new Set<Fixture>([...left, ...right].filter((f): f is Fixture => f !== null));
  const remaining = all.filter(m => !placed.has(m));
  if (remaining.length === 0) return [left, right];
  const merged = [...left, ...right];
  let ri = 0;
  for (let i = 0; i < merged.length && ri < remaining.length; i++) {
    if (merged[i] === null) merged[i] = remaining[ri++]!;
  }
  return [merged.slice(0, left.length), merged.slice(left.length)];
}

export function build_bracket(fixtures: readonly Fixture[]): BracketLayout {
  const r32 = fixtures.filter(f => f.stage_name === "Round of 32").slice().sort(compare_by_kickoff);
  const r16 = fixtures.filter(f => f.stage_name === "Round of 16").slice().sort(compare_by_kickoff);
  const qf = fixtures.filter(f => f.stage_name === "Quarter-finals").slice().sort(compare_by_kickoff);
  const sf = fixtures.filter(f => f.stage_name === "Semi-finals").slice().sort(compare_by_kickoff);
  const final = fixtures.find(f => f.stage_name === "Final") ?? null;
  const third_place = fixtures.find(f => f.stage_name === "3rd Place Final") ?? null;

  const r16_teams = new Set(r16.flatMap(m => [m.home_team_id, m.away_team_id]));
  const qf_teams = new Set(qf.flatMap(m => [m.home_team_id, m.away_team_id]));
  const sf_teams = new Set(sf.flatMap(m => [m.home_team_id, m.away_team_id]));
  const final_teams = new Set(final ? [final.home_team_id, final.away_team_id] : []);

  const winner_for = (fx: Fixture, next_teams: Set<string>): string | null => {
    if (next_teams.has(fx.home_team_id)) return fx.home_team_id;
    if (next_teams.has(fx.away_team_id)) return fx.away_team_id;
    return null;
  };

  const r32_winners = r32.map(m => winner_for(m, r16_teams));
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

  const r32_pair_for = (r16_match: Fixture | null): (Fixture | null)[] => {
    if (!r16_match) return [null, null];
    const pair = r32
      .filter((_, i) => r32_winners[i] === r16_match.home_team_id || r32_winners[i] === r16_match.away_team_id)
      .sort(compare_by_kickoff);
    return [pair[0] ?? null, pair[1] ?? null];
  };

  // Each round anchors to the one downstream; when that round is missing
  // (the current round is the deepest played), fill_unplaced lays the
  // unanchored matches out sequentially so they still show. Feeding the
  // FILLED arrays downward keeps the chain intact for partially-played trees.
  const [qf_left, qf_right] = fill_unplaced(qf_pair_for(sf_left), qf_pair_for(sf_right), qf);
  const [r16_left, r16_right] = fill_unplaced(
    [...r16_pair_for(qf_left[0]), ...r16_pair_for(qf_left[1])],
    [...r16_pair_for(qf_right[0]), ...r16_pair_for(qf_right[1])],
    r16,
  );
  // Each R16 slot is fed by 2 R32 matches → 4 R16 × 2 = 8 per side.
  const [r32_left, r32_right] = fill_unplaced(
    r16_left.flatMap(m => r32_pair_for(m)),
    r16_right.flatMap(m => r32_pair_for(m)),
    r32,
  );

  return { r32_left, r16_left, qf_left, sf_left, final, sf_right, qf_right, r16_right, r32_right, third_place };
}
