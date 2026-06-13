// Domain Service (pure): portfolio allocation breakdowns.
//
// Single source for the by-team / by-position / by-age allocation slices and
// the win-rate shown on the Portfolio page. Previously these were computed
// inline AND duplicated across the web and mobile portfolio screens, which had
// already drifted (one guarded the division by total_value, the other did
// not). Both UIs now call this function so the displayed numbers cannot
// diverge — see context/COHERENCE-INVARIANT.md.
//
// Returns structured numeric data (value in €M, pct in %). Formatting and
// label composition (e.g. "<flag> <name>") stay in the UI layer.

import type { Player } from "../player/player";
import { POSITION_LABEL } from "../player/player";
import type { HoldingMetrics } from "./portfolio_metrics";

/** A holding enriched with its player — the input the UIs already hold. */
export interface EnrichedHolding extends HoldingMetrics {
  readonly player: Player;
}

/** Minimal team shape the breakdown needs; structurally satisfied by the
 * domain ``Team`` so callers can pass ``teams_api.get`` directly. */
export interface TeamRef {
  readonly id: string;
  readonly name: string;
  readonly flag: string;
}

export interface AllocationSlice {
  /** Stable identity for the slice (position code, age-bucket label). */
  readonly key: string;
  readonly label: string;
  readonly value: number; // €M market value
  readonly pct: number; // % of total_value (0 when total_value <= 0)
}

export interface TeamAllocationSlice extends Omit<AllocationSlice, "label"> {
  readonly name: string;
  readonly flag: string;
}

export interface PortfolioBreakdowns {
  readonly by_team: readonly TeamAllocationSlice[];
  readonly by_position: readonly AllocationSlice[];
  readonly by_age: readonly AllocationSlice[];
  /** Share of open positions in profit, in %, or null when there are none. */
  readonly win_rate: number | null;
}

const AGE_BUCKETS = [
  { label: "U21", lo: 0, hi: 21 },
  { label: "21-25", lo: 21, hi: 26 },
  { label: "26-30", lo: 26, hi: 31 },
  { label: "31+", lo: 31, hi: 99 },
] as const;

/** Default age applied when a player's age is unknown — lands in 21-25,
 * matching the previous inline behaviour on both surfaces. */
const DEFAULT_AGE = 25;

const pct_of = (value: number, total: number): number => (total > 0 ? (value / total) * 100 : 0);

/** Allocation = how EXPOSURE is distributed across the book. A short is
 * exposure too, so every position is sized by its ABSOLUTE market value
 * (a €1M short = €1M of exposure, like a €1M long) and each slice is measured
 * against the total GROSS exposure — not against AUM (which is dominated by
 * idle cash and made every slice look tiny). Longs and shorts are NOT netted:
 * netting opposite bets on the same team/position to zero would hide real risk.
 */
export function compute_portfolio_breakdowns(
  holdings: readonly EnrichedHolding[],
  resolve_team: (team_id: string) => TeamRef | undefined,
): PortfolioBreakdowns {
  const team_value = new Map<string, { team: TeamRef; value: number }>();
  const position_value = new Map<string, number>();
  const age_value = new Map<string, number>();
  for (const b of AGE_BUCKETS) age_value.set(b.label, 0);

  const gross = holdings.reduce((sum, h) => sum + Math.abs(h.market_value), 0);

  let winners = 0;
  for (const h of holdings) {
    if (h.pnl > 0) winners += 1;
    const exposure = Math.abs(h.market_value);

    const team = resolve_team(h.player.team_id);
    if (team) {
      const acc = team_value.get(team.id) ?? { team, value: 0 };
      acc.value += exposure;
      team_value.set(team.id, acc);
    }

    position_value.set(h.player.position, (position_value.get(h.player.position) ?? 0) + exposure);

    const age = h.player.age ?? DEFAULT_AGE;
    const bucket = AGE_BUCKETS.find(b => age >= b.lo && age < b.hi) ?? AGE_BUCKETS[AGE_BUCKETS.length - 1];
    age_value.set(bucket.label, (age_value.get(bucket.label) ?? 0) + exposure);
  }

  const by_team: TeamAllocationSlice[] = [...team_value.values()]
    .map(({ team, value }) => ({ key: team.id, name: team.name, flag: team.flag, value, pct: pct_of(value, gross) }))
    .sort((a, b) => b.value - a.value);

  const by_position: AllocationSlice[] = [...position_value.entries()]
    .map(([position, value]) => ({
      key: position,
      label: POSITION_LABEL[position as keyof typeof POSITION_LABEL] ?? position,
      value,
      pct: pct_of(value, gross),
    }))
    .sort((a, b) => b.value - a.value);

  // Age keeps bucket order (not value order) so the legend reads U21 → 31+.
  const by_age: AllocationSlice[] = AGE_BUCKETS.map(b => ({
    key: b.label,
    label: b.label,
    value: age_value.get(b.label) ?? 0,
    pct: pct_of(age_value.get(b.label) ?? 0, gross),
  })).filter(slice => slice.value > 0);

  const win_rate = holdings.length > 0 ? (winners / holdings.length) * 100 : null;

  return { by_team, by_position, by_age, win_rate };
}
