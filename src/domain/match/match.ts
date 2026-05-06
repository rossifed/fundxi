import type { Position } from "@/domain/player/player";

export type MatchStatus = "live" | "finished" | "upcoming";

export interface MatchPlayer {
  id: number;
  name: string;
  full_name?: string;
  jersey_number: number;
  position: Position;
  value: number;
  rating: number;
  team_id?: string;
  change_24h?: number;
  tags?: string[];
}

export interface MatchEvent {
  minute: number;
  type: string; // emoji discriminator: ⚽ 🟨 🔄 🧤 📊
  player_id: number;
  player_name?: string;
  team_id?: string;
  headline?: string;
  comment?: string;
}

export interface PlayerCurvePoint {
  minute: number;
  performance: number;
}

export interface Match {
  fixture_id?: number;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  minute: number;
  group: string;
  status: MatchStatus;
  home_xi: (number | MatchPlayer)[];
  away_xi: MatchPlayer[];
  player_changes: Record<number, number>;
  events: MatchEvent[];
  player_curves?: Record<number, PlayerCurvePoint[]>;
}
