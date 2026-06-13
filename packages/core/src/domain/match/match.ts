import type { Position } from "@fundxi/core/domain/player/player";

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
  change_last_match?: number; // %, net price change over the latest fixture — moves live during play
  // Sportmonks tactical grid coordinate "row:col" (e.g. "2:3"). Authoritative
  // source for pitch placement; absent for bench and pre-ingestion fixtures.
  formation_field?: string | null;
  tags?: string[];
}

export interface MatchEvent {
  minute: number;
  extra_minute?: number;
  type: string; // emoji discriminator: ⚽ 🟨 🔄 🧤 📊
  player_id: number;
  player_name?: string;
  // The "other" player in a substitution (player going OFF) or the
  // assist provider on a goal. Drives the pitch swap + sub badges.
  related_player_id?: number;
  related_player_name?: string;
  // The team the event is CREDITED to. For an own goal this is the
  // benefiting team (the scorer's opponent), already normalised by the BFF —
  // so the scorer (player_name) belongs to the OTHER team.
  team_id?: string;
  headline?: string;
  comment?: string;
  // True for an own goal. The glyph stays "⚽" but it renders distinctly (red)
  // and does not count as a normal goal for the scorer.
  is_own_goal?: boolean;
}

export interface PlayerCurvePoint {
  minute: number;
  performance: number;
}

export interface Match {
  fixture_id?: number;
  home_bench?: MatchPlayer[];
  away_bench?: MatchPlayer[];
  // Hex of the primary kit color each team wore in this match (Sportmonks
  // fixture metadata type_id 161 / 162). Null when not yet ingested.
  home_kit_color?: string | null;
  away_kit_color?: string | null;
  // Tactical formation each team played (e.g. "4-3-3"). Null when not ingested.
  home_formation?: string | null;
  away_formation?: string | null;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  minute: number;
  group: string;
  status: MatchStatus;
  home_xi: (number | MatchPlayer)[];
  away_xi: MatchPlayer[];
  events: MatchEvent[];
  player_curves?: Record<number, PlayerCurvePoint[]>;
}
