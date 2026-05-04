export type Position = "FW" | "MF" | "DF" | "GK";

export const POSITION_LABEL: Record<Position, string> = {
  FW: "Forward",
  MF: "Midfield",
  DF: "Defence",
  GK: "Goalkeeper",
};

export interface Player {
  id: number;
  name: string;
  jersey_number: number;
  team_id: string;
  position: Position;
  value: number; // €M
  change_24h: number; // %
  rating: number;
  full_name?: string;
  tags?: string[];
  age?: number;
  foot?: string;
  height?: string;
  weight?: string;
  club?: string;
  bio?: string;
}
