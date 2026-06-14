/* Substitution state — pure derivation from the match events feed.
 *
 * The backend ships the STARTING XI + bench (a snapshot of the
 * announced lineup). Substitutions are then recorded as match events
 * with both ``player_id`` (entering) and ``related_player_id``
 * (leaving), per Sportmonks' convention (verified on real WC2022
 * payloads). To show "who is on the pitch right now" + the sub badges
 * on each affected player, we walk the substitution events and derive
 * the effective composition + a per-player annotation.
 *
 * Pure: no I/O, no state, deterministic. Same helper called by both
 * the pitch view and the list view ⇒ they cannot show different
 * effective XIs / badges for the same match (UI coherence by
 * construction; see context/COHERENCE-INVARIANT.md + memory
 * ui-coherence-symmetry).
 */

import type { MatchEvent, MatchPlayer } from "./match";

/** A player who has been substituted in or out during the match. */
export interface SubInfo {
  /** "on" = entered the field; "off" = exited the field. */
  direction: "on" | "off";
  minute: number;
  extra_minute?: number;
  /** The other player in the swap (id + name when available — name is
   * not strictly needed for rendering but helps for the badge tooltip). */
  partner_id: number | undefined;
  partner_name: string | undefined;
}

/** ``type`` glyph the backend emits for a substitution event. The
 * scoreboard / pitch use a different mapping per event family; this
 * is the one shared by the substitution path. */
const SUB_GLYPH = "🔄";

/** Tally per-player sub annotations from the match events. A player
 * subbed in then out (rare) keeps the LATEST event so the rendered
 * state matches "what is true now". */
export function compute_subs(events: MatchEvent[]): Map<number, SubInfo> {
  const out = new Map<number, SubInfo>();
  for (const ev of events) {
    if (ev.type !== SUB_GLYPH) continue;
    // Convention (Sportmonks, verified): player_id = entered the
    // field; related = left the field. Mirror that direction here.
    if (ev.player_id) {
      out.set(ev.player_id, {
        direction: "on",
        minute: ev.minute,
        extra_minute: ev.extra_minute,
        partner_id: ev.related_player_id,
        partner_name: ev.related_player_name,
      });
    }
    if (ev.related_player_id) {
      out.set(ev.related_player_id, {
        direction: "off",
        minute: ev.minute,
        extra_minute: ev.extra_minute,
        partner_id: ev.player_id,
        partner_name: ev.player_name,
      });
    }
  }
  return out;
}

/** Recompose the effective on-field XI + bench from the starting
 * lineup snapshot + the sub annotations. Order on the pitch is
 * preserved: an entering player TAKES THE FORMATION SLOT of the
 * player they replaced — so the pitch geometry stays consistent
 * (we don't break the 4-3-3 shape because a midfielder came on).
 *
 * Bench order: unchanged for players who stayed bench; subbed-off
 * players are appended at the end so they're visible but clearly
 * distinct from unused subs.
 */
// Defensive: the live match payload can leak bench / subbed-in players into the
// starting XI, so the on-field XI would balloon to the whole squad. Reduce the
// snapshot to a single, full XI: drop duplicate ids, and when there are still
// more than 11, keep the players that hold a real formation slot first (the
// genuine starters) and cap at 11. A no-op for a well-formed 11-man lineup.
function resolve_starting_xi(starters: MatchPlayer[]): MatchPlayer[] {
  const seen = new Set<number>();
  const unique: MatchPlayer[] = [];
  for (const p of starters) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      unique.push(p);
    }
  }
  if (unique.length <= 11) return unique;
  const with_slot = unique.filter(p => p.formation_field != null);
  const without_slot = unique.filter(p => p.formation_field == null);
  return [...with_slot, ...without_slot].slice(0, 11);
}

export function apply_subs(
  starters: MatchPlayer[],
  bench: MatchPlayer[],
  subs: Map<number, SubInfo>,
): { on_field: MatchPlayer[]; bench: MatchPlayer[] } {
  const bench_by_id = new Map(bench.map(p => [p.id, p]));
  const on_field: MatchPlayer[] = [];
  const used_from_bench = new Set<number>();
  const actually_swapped_out: MatchPlayer[] = [];
  for (const s of resolve_starting_xi(starters)) {
    const info = subs.get(s.id);
    if (info?.direction === "off" && info.partner_id && bench_by_id.has(info.partner_id)) {
      // Swap: the entering player takes this formation slot, inheriting
      // formation_field so the pitch geometry is preserved.
      const entering = bench_by_id.get(info.partner_id)!;
      on_field.push({ ...entering, formation_field: s.formation_field });
      used_from_bench.add(entering.id);
      actually_swapped_out.push(s);
    } else {
      // No usable partner (corrupt event) → keep the starter on the
      // field; do NOT also list him on the bench (would double him).
      on_field.push(s);
    }
  }
  const remaining_bench = bench.filter(p => !used_from_bench.has(p.id));
  return { on_field, bench: [...remaining_bench, ...actually_swapped_out] };
}
