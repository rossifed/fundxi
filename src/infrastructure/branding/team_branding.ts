// Local branding overlay (emoji flag, hex color, confederation, group) keyed
// by ISO3 code. Backend (/api/teams) gives us name, kind, sportmonks fields,
// and a flag URL — but the frontend wants emoji flags and a brand color, so
// we overlay this static map at fetch time. Eventually moves to the backend.

export interface TeamBranding {
  flag: string;
  color: string;
  confederation: "UEFA" | "CONMEBOL" | "CONCACAF" | "AFC" | "CAF" | "OFC";
  group?: string;
}

export const TEAM_BRANDING: Record<string, TeamBranding> = {
  // CONMEBOL
  ARG: { flag: "🇦🇷", color: "#75AADB", confederation: "CONMEBOL", group: "A" },
  BRA: { flag: "🇧🇷", color: "#009C3B", confederation: "CONMEBOL", group: "G" },
  URU: { flag: "🇺🇾", color: "#001489", confederation: "CONMEBOL", group: "H" },
  COL: { flag: "🇨🇴", color: "#FCD116", confederation: "CONMEBOL", group: "D" },
  ECU: { flag: "🇪🇨", color: "#FFD100", confederation: "CONMEBOL", group: "K" },
  PAR: { flag: "🇵🇾", color: "#DA121A", confederation: "CONMEBOL", group: "L" },
  // UEFA
  FRA: { flag: "🇫🇷", color: "#002395", confederation: "UEFA", group: "D" },
  ENG: { flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", color: "#CF081F", confederation: "UEFA", group: "B" },
  ESP: { flag: "🇪🇸", color: "#AA151B", confederation: "UEFA", group: "E" },
  GER: { flag: "🇩🇪", color: "#222", confederation: "UEFA", group: "F" },
  POR: { flag: "🇵🇹", color: "#006847", confederation: "UEFA", group: "I" },
  NED: { flag: "🇳🇱", color: "#FF6600", confederation: "UEFA", group: "C" },
  BEL: { flag: "🇧🇪", color: "#ED2939", confederation: "UEFA", group: "J" },
  CRO: { flag: "🇭🇷", color: "#FF0000", confederation: "UEFA", group: "G" },
  SUI: { flag: "🇨🇭", color: "#D52B1E", confederation: "UEFA", group: "L" },
  AUT: { flag: "🇦🇹", color: "#EF3340", confederation: "UEFA", group: "F" },
  NOR: { flag: "🇳🇴", color: "#BA0C2F", confederation: "UEFA", group: "H" },
  SCO: { flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", color: "#003078", confederation: "UEFA", group: "I" },
  ITA: { flag: "🇮🇹", color: "#006AB6", confederation: "UEFA", group: "B" },
  SWE: { flag: "🇸🇪", color: "#006AA7", confederation: "UEFA", group: "C" },
  TUR: { flag: "🇹🇷", color: "#E30A17", confederation: "UEFA", group: "J" },
  DEN: { flag: "🇩🇰", color: "#C8102E", confederation: "UEFA", group: "K" },
  POL: { flag: "🇵🇱", color: "#DC143C", confederation: "UEFA", group: "C" },
  SRB: { flag: "🇷🇸", color: "#C6363C", confederation: "UEFA", group: "G" },
  WAL: { flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", color: "#D30731", confederation: "UEFA", group: "B" },
  // CONCACAF
  USA: { flag: "🇺🇸", color: "#002868", confederation: "CONCACAF", group: "B" },
  MEX: { flag: "🇲🇽", color: "#006847", confederation: "CONCACAF", group: "A" },
  CAN: { flag: "🇨🇦", color: "#FF0000", confederation: "CONCACAF", group: "C" },
  PAN: { flag: "🇵🇦", color: "#D21034", confederation: "CONCACAF", group: "F" },
  CUR: { flag: "🇨🇼", color: "#002B7F", confederation: "CONCACAF", group: "L" },
  HAI: { flag: "🇭🇹", color: "#00209F", confederation: "CONCACAF", group: "I" },
  CRC: { flag: "🇨🇷", color: "#002B7F", confederation: "CONCACAF" },
  CRI: { flag: "🇨🇷", color: "#002B7F", confederation: "CONCACAF" },
  // AFC
  JPN: { flag: "🇯🇵", color: "#BC002D", confederation: "AFC", group: "E" },
  IRN: { flag: "🇮🇷", color: "#239F40", confederation: "AFC", group: "A" },
  KOR: { flag: "🇰🇷", color: "#C60C30", confederation: "AFC", group: "H" },
  AUS: { flag: "🇦🇺", color: "#00843D", confederation: "AFC", group: "G" },
  KSA: { flag: "🇸🇦", color: "#006C35", confederation: "AFC", group: "D" },
  QAT: { flag: "🇶🇦", color: "#8A1538", confederation: "AFC", group: "A" },
  UZB: { flag: "🇺🇿", color: "#0099B5", confederation: "AFC", group: "K" },
  JOR: { flag: "🇯🇴", color: "#007A3D", confederation: "AFC", group: "F" },
  // CAF
  MAR: { flag: "🇲🇦", color: "#C1272D", confederation: "CAF", group: "A" },
  SEN: { flag: "🇸🇳", color: "#00853F", confederation: "CAF", group: "I" },
  EGY: { flag: "🇪🇬", color: "#C8102E", confederation: "CAF", group: "E" },
  ALG: { flag: "🇩🇿", color: "#006233", confederation: "CAF", group: "H" },
  TUN: { flag: "🇹🇳", color: "#E70013", confederation: "CAF", group: "D" },
  RSA: { flag: "🇿🇦", color: "#007749", confederation: "CAF", group: "C" },
  CIV: { flag: "🇨🇮", color: "#F77F00", confederation: "CAF", group: "G" },
  GHA: { flag: "🇬🇭", color: "#006B3F", confederation: "CAF", group: "J" },
  CMR: { flag: "🇨🇲", color: "#007A5E", confederation: "CAF" },
  CPV: { flag: "🇨🇻", color: "#003893", confederation: "CAF", group: "L" },
  // OFC
  NZL: { flag: "🇳🇿", color: "#000000", confederation: "OFC", group: "E" },
};

export function brand_for(team_id: string): TeamBranding {
  return TEAM_BRANDING[team_id] ?? {
    flag: "🏳️",
    color: "#888888",
    confederation: "UEFA",
  };
}
