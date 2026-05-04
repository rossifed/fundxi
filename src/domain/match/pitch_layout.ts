import type { MatchPlayer } from "./match";

// Domain service — pure geometry for placing players on the pitch.

export type Formation = "4-4-2" | "4-3-3" | "3-5-2";

export interface PitchCoord {
  x: number; // 0-100 horizontal
  y: number; // 0-100 vertical
}

export const PITCH_SLOTS: Record<string, PitchCoord> = {
  GK: { x: 50, y: 90 },
  LB: { x: 12, y: 56 },
  LCB: { x: 33, y: 58 },
  RCB: { x: 67, y: 58 },
  RB: { x: 88, y: 56 },
  CB: { x: 50, y: 58 },
  LWB: { x: 10, y: 48 },
  RWB: { x: 90, y: 48 },
  CDM: { x: 50, y: 39 },
  LCDM: { x: 33, y: 39 },
  RCDM: { x: 67, y: 39 },
  LM: { x: 10, y: 28 },
  LCM: { x: 33, y: 30 },
  CM: { x: 50, y: 30 },
  RCM: { x: 67, y: 30 },
  RM: { x: 90, y: 28 },
  LAM: { x: 28, y: 18 },
  CAM: { x: 50, y: 18 },
  RAM: { x: 72, y: 18 },
  LW: { x: 14, y: 9 },
  LST: { x: 38, y: 7 },
  ST: { x: 50, y: 5 },
  RST: { x: 62, y: 7 },
  RW: { x: 86, y: 9 },
  CF: { x: 50, y: 7 },
};

export const FORMATIONS: Record<Formation, string[]> = {
  "4-4-2": ["GK", "LB", "LCB", "RCB", "RB", "LM", "LCM", "RCM", "RM", "LST", "RST"],
  "4-3-3": ["GK", "LB", "LCB", "RCB", "RB", "LCM", "CDM", "RCM", "LW", "ST", "RW"],
  "3-5-2": ["GK", "LCB", "CB", "RCB", "LWB", "LCM", "CDM", "RCM", "RWB", "LST", "RST"],
};

export interface PositionedPlayer extends MatchPlayer {
  team_color: string;
  x: number;
  y: number;
  role: string;
}

export function get_match_positions(
  players: (MatchPlayer & { team_color: string })[],
  formation: Formation,
): PositionedPlayer[] {
  const slots = FORMATIONS[formation] || FORMATIONS["4-4-2"];
  return players.map((p, i) => {
    const slot = slots[i];
    const coord = PITCH_SLOTS[slot] ?? { x: 50, y: 50 };
    return { ...p, x: coord.x, y: coord.y, role: slot };
  });
}
