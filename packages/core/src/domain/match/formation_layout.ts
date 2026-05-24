// Formation → pitch coordinates resolver.
//
// Two strategies, in order of preference:
//
// 1. **Sportmonks grid (authoritative).** Each starter carries a
//    `formation_field` string of the form `"row:col"` (e.g. `"2:3"`),
//    placing them on a tactical grid: row 1 = goalkeeper, row R = striker
//    line, columns numbered from left to right starting at 1. This is the
//    provider's canonical encoding of who stood where — we trust it.
//
// 2. **Formation-string fallback.** When `formation_field` is missing
//    (older ingestion runs, bench players, providers that don't ship it),
//    we parse the team's formation string ("4-3-3", "4-2-3-1", ...) and
//    distribute the XI evenly across rows by position group.
//
// Output coordinates use the **shared pitch** convention: y=0 is the top
// of the SVG (far goal), y=100 is the bottom (near goal). When rendered
// as a single-team view (PitchView), the layout is always solved on the
// near side — see `side` parameter of `compute_pitch_positions`.
//
// DDD role: Domain Service (pure functions).

import type { MatchPlayer } from "@fundxi/core/domain/match/match";
import type { Position } from "@fundxi/core/domain/player/player";

export interface PitchPosition {
  player: MatchPlayer;
  x: number; // 0..100, left → right touchline
  y: number; // 0..100, far goal → near goal
}

// Vertical band each row of the Sportmonks grid maps to.
//
// - Shared-pitch (dual-team) layout: the team occupies its own half only,
//   the gap to the halfway line stays empty — that's the half they attack.
// - Single-team layout: the team owns the full pitch length, GK at near
//   baseline, forwards stretched up toward the far goal. This is the mode
//   the PitchView uses; it gives tokens room to breathe vertically.
const Y_GK_NEAR = 87; // a few units off the goal line so the GK token's
// name + photo don't overlap the bottom touchline / goal line of the pitch
const Y_LAST_NEAR_DUAL = 52; // shared layout: forwards stop at midfield
const Y_LAST_NEAR_SINGLE = 14; // single-team: forwards reach the far box

// Horizontal usable area: a comfortable margin keeps tokens off the
// touchlines (where labels would clip against the trapezoid edge).
const X_MARGIN = 8;
const X_USABLE = 100 - 2 * X_MARGIN;

// ----- Sportmonks-grid strategy -------------------------------------------

interface Cell {
  row: number;
  col: number;
}

function parse_cell(field: string | null | undefined): Cell | null {
  if (!field) return null;
  const m = /^(\d+):(\d+)$/.exec(field.trim());
  if (!m) return null;
  const row = parseInt(m[1], 10);
  const col = parseInt(m[2], 10);
  if (!Number.isFinite(row) || !Number.isFinite(col) || row < 1 || col < 1) return null;
  return { row, col };
}

function compute_from_grid(
  xi: MatchPlayer[],
  side: "home" | "away",
  single_team: boolean,
): PitchPosition[] | null {
  const cells: { player: MatchPlayer; cell: Cell }[] = [];
  for (const p of xi) {
    const c = parse_cell(p.formation_field);
    if (!c) return null; // partial data → fall back to heuristic
    cells.push({ player: p, cell: c });
  }
  if (cells.length === 0) return null;

  // Discover the actual row count for this team (4-3-3 → 4 rows, 4-2-3-1
  // → 5). Per-row column count = max col occupied in that row — this
  // handles asymmetric formations naturally.
  const max_row = cells.reduce((m, c) => Math.max(m, c.cell.row), 1);
  const cols_per_row = new Map<number, number>();
  for (const { cell } of cells) {
    cols_per_row.set(cell.row, Math.max(cols_per_row.get(cell.row) ?? 0, cell.col));
  }

  // Horizontal mirroring. Sportmonks numbers columns 1..N in the broadcast
  // orientation (col 1 = broadcast right, col N = broadcast left) — they
  // are NOT team-relative. Verified empirically on WC2022 ARG-FRA:
  // ARG (home, attacks up) col 1 = RB Molina, col 4 = LB Tagliafico → col 1
  // is the team's right. FRA (away, attacks down) col 1 = LB Theo Hernández
  // → col 1 is the team's left.
  //
  // To render a single-team view as "behind own goal looking up-field",
  // the team's right must appear on the screen's right. The home team
  // needs col 1 → screen right (mirrored). The away team is naturally
  // aligned: col 1 → screen left == team's own left.
  //
  // In shared (dual-team) layout, we keep the raw broadcast orientation so
  // both teams remain consistent relative to one another.
  const mirror_cols = single_team && side === "home";

  // Y bounds depend on layout mode.
  const y_last = single_team ? Y_LAST_NEAR_SINGLE : Y_LAST_NEAR_DUAL;

  const out: PitchPosition[] = [];
  for (const { player, cell } of cells) {
    const t = max_row > 1 ? (cell.row - 1) / (max_row - 1) : 0;
    const near_y = Y_GK_NEAR + (y_last - Y_GK_NEAR) * t;
    const y = single_team || side === "home" ? near_y : 100 - near_y;

    const ncols = cols_per_row.get(cell.row) ?? 1;
    const raw_x_frac = (cell.col - 0.5) / ncols;
    const x_frac = mirror_cols ? 1 - raw_x_frac : raw_x_frac;
    const x = X_MARGIN + x_frac * X_USABLE;

    out.push({ player, x, y });
  }
  return out;
}

// ----- Formation-string fallback ------------------------------------------

function row_x(slot_idx: number, slot_count: number): number {
  if (slot_count <= 0) return 50;
  return X_MARGIN + ((slot_idx + 0.5) / slot_count) * X_USABLE;
}

function parse_formation(formation: string | null | undefined): number[] {
  if (!formation) return [4, 3, 3];
  const parts = formation.split("-").map(p => parseInt(p, 10));
  if (parts.length < 2 || parts.some(p => !Number.isFinite(p) || p < 1)) return [4, 3, 3];
  const sum = parts.reduce((a, b) => a + b, 0);
  if (sum !== 10) return [4, 3, 3];
  return parts;
}

function compute_from_formation_string(
  xi: MatchPlayer[],
  formation: string | null | undefined,
  side: "home" | "away",
  single_team: boolean,
): PitchPosition[] {
  const rows = parse_formation(formation);
  const total_rows = rows.length;
  const max_row = total_rows + 1; // outfield rows + GK
  const y_last = single_team ? Y_LAST_NEAR_SINGLE : Y_LAST_NEAR_DUAL;

  const by_pos: Record<Position, MatchPlayer[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of xi) by_pos[p.position].push(p);
  for (const k of Object.keys(by_pos) as Position[]) {
    by_pos[k].sort((a, b) => (a.jersey_number || 99) - (b.jersey_number || 99));
  }

  const y_for_row = (row_idx_1based: number): number => {
    const t = max_row > 1 ? (row_idx_1based - 1) / (max_row - 1) : 0;
    const near_y = Y_GK_NEAR + (y_last - Y_GK_NEAR) * t;
    return single_team || side === "home" ? near_y : 100 - near_y;
  };

  const out: PitchPosition[] = [];
  const placed = new Set<number>();
  const push = (player: MatchPlayer, x: number, y: number) => {
    out.push({ player, x, y });
    placed.add(player.id);
  };

  const gk = by_pos.GK[0];
  if (gk) push(gk, 50, y_for_row(1));

  const df_count = rows[0];
  const dfs = by_pos.DF.slice(0, df_count);
  for (let i = 0; i < dfs.length; i++) push(dfs[i], row_x(i, df_count), y_for_row(2));

  const fw_count = rows[rows.length - 1];
  const fws = by_pos.FW.slice(0, fw_count);
  for (let i = 0; i < fws.length; i++) {
    push(fws[i], row_x(i, fw_count), y_for_row(max_row));
  }

  const mf_rows = rows.slice(1, -1);
  const mfs = by_pos.MF;
  let mf_idx = 0;
  for (let r = 0; r < mf_rows.length; r++) {
    const slot_count = mf_rows[r];
    for (let i = 0; i < slot_count && mf_idx < mfs.length; i++) {
      push(mfs[mf_idx], row_x(i, slot_count), y_for_row(3 + r));
      mf_idx++;
    }
  }

  // Stragglers (lineup count vs formation mismatch): slot them just in
  // front of the GK so they remain visible but obviously off-grid.
  const leftover = xi.filter(p => !placed.has(p.id));
  const fallback_y = (y_for_row(1) + y_for_row(2)) / 2;
  for (let i = 0; i < leftover.length; i++) {
    push(leftover[i], row_x(i, Math.max(leftover.length, 1)), fallback_y);
  }
  return out;
}

// ----- Public entry point -------------------------------------------------

export function compute_pitch_positions(
  xi: MatchPlayer[],
  formation: string | null | undefined,
  side: "home" | "away",
  options: { single_team?: boolean } = {},
): PitchPosition[] {
  const single_team = options.single_team ?? false;
  const grid = compute_from_grid(xi, side, single_team);
  if (grid) return grid;
  return compute_from_formation_string(xi, formation, side, single_team);
}
