export type Position = "FW" | "MF" | "DF" | "GK";

export const POSITION_LABEL: Record<Position, string> = {
  FW: "Forward",
  MF: "Midfield",
  DF: "Defence",
  GK: "Goalkeeper",
};

// 3-letter acronyms for compact surfaces (e.g. inline next to the team
// name in the portfolio positions list).
export const POSITION_ABBR: Record<Position, string> = {
  FW: "FWD",
  MF: "MDF",
  DF: "DEF",
  GK: "GKP",
};

// Identity + descriptive attributes only. Pricing lives in PlayerValuation.
export interface Player {
  id: number;
  name: string;
  jersey_number: number;
  team_id: string;
  position: Position;
  full_name?: string;
  tags?: string[];
  age?: number;
  foot?: string;
  height?: string;
  weight?: string;
  club?: string;
  bio?: string;
  image_path?: string;          // Sportmonks player headshot (CDN, to be mirrored S3 later)
  detailed_position?: string;    // e.g., "Centre-Back", "Holding Midfielder"
  date_of_birth?: string;        // ISO date "YYYY-MM-DD"
  birth_city?: string;
  nationality_name?: string;
  nationality_iso?: string;      // ISO2 code, e.g. "AR"
  nationality_flag_url?: string; // Sportmonks country flag PNG
}
