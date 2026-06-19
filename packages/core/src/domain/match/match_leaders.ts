// match_leaders — pick the standout player per stat for a fixture.
//
// DDD role: Domain Service (pure function). Single source of the "who leads
// what" logic so web and mobile render identical highlight cards (parity).
// Each leader is the argmax of one metric over the fixture's stat lines,
// ignoring zero/null values. Identity + display formatting live in the UI;
// this returns ids and raw values only.
import type { PlayerMatchStat } from "@fundxi/core/domain/match/player_match_stats";

// A pass-accuracy leader is only meaningful above a floor of attempts —
// otherwise a substitute with 1/1 = 100% wins a card he shouldn't.
export const MIN_PASSES_FOR_ACCURACY = 15;

export type StatLeaderKey = "scorer" | "playmaker" | "shots" | "passer" | "dangerous";

export interface StatLeader {
  player_id: number;
  /** Primary metric value (goals, key passes, shots, pass %, xG). */
  value: number;
  /** Secondary context for the card (assists, shots on target, passes total).
   *  Null when there is no meaningful secondary for the metric. */
  secondary: number | null;
}

/** Argmax of ``metric`` over eligible rows with a strictly positive value.
 *  Ties keep the first row encountered (stable by the caller's ordering). */
function arg_max(
  stats: readonly PlayerMatchStat[],
  metric: (s: PlayerMatchStat) => number | null,
  eligible: (s: PlayerMatchStat) => boolean = () => true,
): PlayerMatchStat | null {
  let best: PlayerMatchStat | null = null;
  let best_value = 0;
  for (const s of stats) {
    const v = metric(s);
    if (v === null || v <= 0 || !eligible(s)) continue;
    if (best === null || v > best_value) {
      best = s;
      best_value = v;
    }
  }
  return best;
}

export function compute_stat_leaders(
  stats: readonly PlayerMatchStat[],
): Partial<Record<StatLeaderKey, StatLeader>> {
  const out: Partial<Record<StatLeaderKey, StatLeader>> = {};

  const scorer = arg_max(stats, s => s.goals);
  if (scorer) out.scorer = { player_id: scorer.player_id, value: scorer.goals!, secondary: scorer.assists };

  const playmaker = arg_max(stats, s => s.key_passes);
  if (playmaker)
    out.playmaker = { player_id: playmaker.player_id, value: playmaker.key_passes!, secondary: playmaker.assists };

  const shots = arg_max(stats, s => s.shots_total);
  if (shots) out.shots = { player_id: shots.player_id, value: shots.shots_total!, secondary: shots.shots_on_target };

  const passer = arg_max(stats, s => s.passes_accuracy, s => (s.passes_total ?? 0) >= MIN_PASSES_FOR_ACCURACY);
  if (passer) out.passer = { player_id: passer.player_id, value: passer.passes_accuracy!, secondary: passer.passes_total };

  const dangerous = arg_max(stats, s => s.xg);
  if (dangerous) out.dangerous = { player_id: dangerous.player_id, value: dangerous.xg!, secondary: null };

  return out;
}

// --- Display contract (shared web + mobile) --------------------------------
//
// build_leader_cards turns the raw leaders into ready-to-render card
// descriptors: label, formatted value, optional sub, and a colour tone. This
// lives in the domain ON PURPOSE — it is the single source of the highlight
// strip's copy, formatting, ordering and guards, so web and mobile render
// identical cards by construction (parity). The platform UI only owns the card
// styling; identity (name/photo/team) is resolved by ``player_id``.

export type LeaderCardKey = "mover" | StatLeaderKey;

export interface LeaderCardDescriptor {
  key: LeaderCardKey;
  player_id: number;
  /** Category copy, e.g. "TOP SCORER", "MOST DANGEROUS". */
  label: string;
  /** Pre-formatted headline value, e.g. "▲ +8.3%", "2", "96%", "0.74". */
  value: string;
  /** Optional secondary line, e.g. "1 assist", "2 on target". */
  sub?: string;
  tone: "positive" | "negative" | "neutral";
}

/** Minimal roster shape needed for the price-mover card. */
export interface LeaderRosterPlayer {
  id: number;
  change_this_match?: number;
}

// Below this |Δ| nobody is a "mover" — keeps pre-kickoff (all ~0) quiet.
const MOVER_MIN = 0.05;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function build_leader_cards(
  players: readonly LeaderRosterPlayer[],
  stats: readonly PlayerMatchStat[],
): LeaderCardDescriptor[] {
  const cards: LeaderCardDescriptor[] = [];

  // Price mover — biggest gainer of the match (from the roster, no stats needed).
  let mover: LeaderRosterPlayer | null = null;
  for (const p of players) {
    const d = p.change_this_match ?? 0;
    if (d >= MOVER_MIN && (mover === null || d > (mover.change_this_match ?? 0))) mover = p;
  }
  if (mover) {
    const d = mover.change_this_match ?? 0;
    cards.push({ key: "mover", player_id: mover.id, label: "TOP MOVER", value: `▲ +${d.toFixed(1)}%`, tone: "positive" });
  }

  const leaders = compute_stat_leaders(stats);
  if (leaders.scorer)
    cards.push({
      key: "scorer",
      player_id: leaders.scorer.player_id,
      label: "TOP SCORER",
      value: String(leaders.scorer.value),
      sub: (leaders.scorer.secondary ?? 0) > 0 ? plural(leaders.scorer.secondary!, "assist", "assists") : undefined,
      tone: "neutral",
    });
  if (leaders.dangerous)
    cards.push({
      key: "dangerous",
      player_id: leaders.dangerous.player_id,
      label: "MOST DANGEROUS",
      value: leaders.dangerous.value.toFixed(2),
      sub: "expected goals",
      tone: "neutral",
    });
  if (leaders.playmaker)
    cards.push({
      key: "playmaker",
      player_id: leaders.playmaker.player_id,
      label: "PLAYMAKER",
      value: String(leaders.playmaker.value),
      sub: "key passes",
      tone: "neutral",
    });
  if (leaders.shots)
    cards.push({
      key: "shots",
      player_id: leaders.shots.player_id,
      label: "MOST SHOTS",
      value: String(leaders.shots.value),
      sub: (leaders.shots.secondary ?? 0) > 0 ? `${leaders.shots.secondary} on target` : undefined,
      tone: "neutral",
    });
  if (leaders.passer)
    cards.push({
      key: "passer",
      player_id: leaders.passer.player_id,
      label: "TOP PASSER",
      value: `${Math.round(leaders.passer.value)}%`,
      sub: leaders.passer.secondary != null ? `${leaders.passer.secondary} passes` : undefined,
      tone: "neutral",
    });

  return cards;
}
