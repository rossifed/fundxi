import { describe, expect, it } from "vitest";
import type { MatchEvent, MatchPlayer } from "./match";
import { apply_subs, compute_subs } from "./substitutions";

// --- helpers --------------------------------------------------------------

function _player(id: number, name: string, formation_field?: string): MatchPlayer {
  return {
    id,
    name,
    jersey_number: id,
    position: "MF",
    value: 10,
    rating: 6.0,
    formation_field,
  };
}

function _sub_event(player_in: number, player_out: number, minute: number, in_name?: string, out_name?: string): MatchEvent {
  return {
    minute,
    type: "🔄",
    player_id: player_in,
    player_name: in_name,
    related_player_id: player_out,
    related_player_name: out_name,
    team_id: "FRA",
  };
}

// --- compute_subs ---------------------------------------------------------

describe("compute_subs", () => {
  it("returns an empty map when there are no substitution events", () => {
    const m = compute_subs([
      { minute: 12, type: "⚽", player_id: 1 },
      { minute: 30, type: "🟨", player_id: 7 },
    ]);
    expect(m.size).toBe(0);
  });

  it("annotates the entering player as direction='on' with the partner = leaving player", () => {
    const m = compute_subs([_sub_event(100, 200, 60, "Camavinga", "Theo")]);
    expect(m.get(100)).toEqual({
      direction: "on",
      minute: 60,
      extra_minute: undefined,
      partner_id: 200,
      partner_name: "Theo",
    });
  });

  it("annotates the leaving player as direction='off' with the partner = entering player", () => {
    const m = compute_subs([_sub_event(100, 200, 60, "Camavinga", "Theo")]);
    expect(m.get(200)).toEqual({
      direction: "off",
      minute: 60,
      extra_minute: undefined,
      partner_id: 100,
      partner_name: "Camavinga",
    });
  });

  it("when a player is subbed in then back out, the LATEST event wins", () => {
    const m = compute_subs([
      _sub_event(100, 200, 60), // 100 in
      _sub_event(300, 100, 80), // 100 out
    ]);
    expect(m.get(100)?.direction).toBe("off");
    expect(m.get(100)?.minute).toBe(80);
  });

  it("ignores non-substitution events even with related_player_id set (e.g. goal+assist)", () => {
    const m = compute_subs([
      { minute: 25, type: "⚽", player_id: 5, related_player_id: 9 }, // goal+assist
    ]);
    expect(m.size).toBe(0);
  });
});

// --- apply_subs -----------------------------------------------------------

describe("apply_subs", () => {
  const starter = _player(1, "Theo", "LB");
  const benched = _player(2, "Camavinga"); // no formation slot
  const other_starter = _player(3, "Mbappe", "FW");
  const other_bench = _player(4, "Coman");

  it("no subs → on_field == starters, bench unchanged", () => {
    const r = apply_subs([starter, other_starter], [benched, other_bench], new Map());
    expect(r.on_field).toEqual([starter, other_starter]);
    expect(r.bench).toEqual([benched, other_bench]);
  });

  it("swap: entering player takes the starter's formation slot, exiting starter moves to bench", () => {
    const subs = compute_subs([_sub_event(2, 1, 60, "Camavinga", "Theo")]);
    const r = apply_subs([starter, other_starter], [benched, other_bench], subs);
    // On the pitch: Camavinga occupies Theo's LB slot.
    expect(r.on_field).toHaveLength(2);
    expect(r.on_field[0].id).toBe(2);
    expect(r.on_field[0].formation_field).toBe("LB");
    expect(r.on_field[1].id).toBe(3); // Mbappe untouched
    // Bench: Camavinga removed (he's on now), Theo appended (subbed off).
    expect(r.bench.map(p => p.id)).toEqual([4, 1]);
  });

  it("multiple swaps preserve formation slots independently", () => {
    const subs = compute_subs([
      _sub_event(2, 1, 60), // Camavinga -> Theo's LB slot
      _sub_event(4, 3, 75), // Coman -> Mbappe's FW slot
    ]);
    const r = apply_subs([starter, other_starter], [benched, other_bench], subs);
    expect(r.on_field[0]).toMatchObject({ id: 2, formation_field: "LB" });
    expect(r.on_field[1]).toMatchObject({ id: 4, formation_field: "FW" });
    expect(r.bench.map(p => p.id)).toEqual([1, 3]); // both subbed-off
  });

  it("guards against a sub event referencing a player NOT on the bench (data inconsistency): keeps the starter", () => {
    const subs = compute_subs([_sub_event(999, 1, 60)]); // 999 not in bench
    const r = apply_subs([starter, other_starter], [benched, other_bench], subs);
    // Theo stays on the pitch because the entering player isn't available.
    expect(r.on_field[0]).toEqual(starter);
    // Bench is also unchanged in such a corrupt-event case.
    expect(r.bench.map(p => p.id)).toEqual([2, 4]);
  });

  it("caps a bloated starting XI to 11, keeping formation-slot holders first", () => {
    // 11 real starters (each with a formation slot) + 2 leaked slot-less players.
    const starters = [
      ...Array.from({ length: 11 }, (_, i) => _player(i + 1, `S${i + 1}`, `${i + 1}:1`)),
      _player(100, "Leaked A"),
      _player(101, "Leaked B"),
    ];
    const r = apply_subs(starters, [], new Map());
    expect(r.on_field).toHaveLength(11);
    expect(r.on_field.map(p => p.id)).not.toContain(100);
    expect(r.on_field.map(p => p.id)).not.toContain(101);
  });

  it("dedupes duplicate starter ids", () => {
    const r = apply_subs([_player(1, "A", "1:1"), _player(1, "A dup", "1:1"), _player(2, "B", "2:1")], [], new Map());
    expect(r.on_field.map(p => p.id)).toEqual([1, 2]);
  });
});
