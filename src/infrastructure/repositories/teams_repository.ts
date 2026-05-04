import type { Team } from "@/domain/team/team";

const TEAMS: Team[] = [
  // CONMEBOL
  { id: "ARG", name: "Argentina", flag: "🇦🇷", color: "#75AADB", kind: "national", confederation: "CONMEBOL", group: "A" },
  { id: "BRA", name: "Brazil", flag: "🇧🇷", color: "#009C3B", kind: "national", confederation: "CONMEBOL", group: "G" },
  { id: "URU", name: "Uruguay", flag: "🇺🇾", color: "#001489", kind: "national", confederation: "CONMEBOL", group: "H" },
  { id: "COL", name: "Colombia", flag: "🇨🇴", color: "#FCD116", kind: "national", confederation: "CONMEBOL", group: "D" },
  { id: "ECU", name: "Ecuador", flag: "🇪🇨", color: "#FFD100", kind: "national", confederation: "CONMEBOL", group: "K" },
  { id: "PAR", name: "Paraguay", flag: "🇵🇾", color: "#DA121A", kind: "national", confederation: "CONMEBOL", group: "L" },
  // UEFA
  { id: "FRA", name: "France", flag: "🇫🇷", color: "#002395", kind: "national", confederation: "UEFA", group: "D" },
  { id: "ENG", name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", color: "#CF081F", kind: "national", confederation: "UEFA", group: "B" },
  { id: "ESP", name: "Spain", flag: "🇪🇸", color: "#AA151B", kind: "national", confederation: "UEFA", group: "E" },
  { id: "GER", name: "Germany", flag: "🇩🇪", color: "#222", kind: "national", confederation: "UEFA", group: "F" },
  { id: "POR", name: "Portugal", flag: "🇵🇹", color: "#006847", kind: "national", confederation: "UEFA", group: "I" },
  { id: "NED", name: "Netherlands", flag: "🇳🇱", color: "#FF6600", kind: "national", confederation: "UEFA", group: "C" },
  { id: "BEL", name: "Belgium", flag: "🇧🇪", color: "#ED2939", kind: "national", confederation: "UEFA", group: "J" },
  { id: "CRO", name: "Croatia", flag: "🇭🇷", color: "#FF0000", kind: "national", confederation: "UEFA", group: "G" },
  { id: "SUI", name: "Switzerland", flag: "🇨🇭", color: "#D52B1E", kind: "national", confederation: "UEFA", group: "L" },
  { id: "AUT", name: "Austria", flag: "🇦🇹", color: "#EF3340", kind: "national", confederation: "UEFA", group: "F" },
  { id: "NOR", name: "Norway", flag: "🇳🇴", color: "#BA0C2F", kind: "national", confederation: "UEFA", group: "H" },
  { id: "SCO", name: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", color: "#003078", kind: "national", confederation: "UEFA", group: "I" },
  { id: "ITA", name: "Italy", flag: "🇮🇹", color: "#006AB6", kind: "national", confederation: "UEFA", group: "B" },
  { id: "SWE", name: "Sweden", flag: "🇸🇪", color: "#006AA7", kind: "national", confederation: "UEFA", group: "C" },
  { id: "TUR", name: "Türkiye", flag: "🇹🇷", color: "#E30A17", kind: "national", confederation: "UEFA", group: "J" },
  { id: "DEN", name: "Denmark", flag: "🇩🇰", color: "#C8102E", kind: "national", confederation: "UEFA", group: "K" },
  // CONCACAF
  { id: "USA", name: "United States", flag: "🇺🇸", color: "#002868", kind: "national", confederation: "CONCACAF", group: "B" },
  { id: "MEX", name: "Mexico", flag: "🇲🇽", color: "#006847", kind: "national", confederation: "CONCACAF", group: "A" },
  { id: "CAN", name: "Canada", flag: "🇨🇦", color: "#FF0000", kind: "national", confederation: "CONCACAF", group: "C" },
  { id: "PAN", name: "Panama", flag: "🇵🇦", color: "#D21034", kind: "national", confederation: "CONCACAF", group: "F" },
  { id: "CUR", name: "Curaçao", flag: "🇨🇼", color: "#002B7F", kind: "national", confederation: "CONCACAF", group: "L" },
  { id: "HAI", name: "Haiti", flag: "🇭🇹", color: "#00209F", kind: "national", confederation: "CONCACAF", group: "I" },
  // AFC
  { id: "JPN", name: "Japan", flag: "🇯🇵", color: "#BC002D", kind: "national", confederation: "AFC", group: "E" },
  { id: "IRN", name: "Iran", flag: "🇮🇷", color: "#239F40", kind: "national", confederation: "AFC", group: "A" },
  { id: "KOR", name: "South Korea", flag: "🇰🇷", color: "#C60C30", kind: "national", confederation: "AFC", group: "H" },
  { id: "AUS", name: "Australia", flag: "🇦🇺", color: "#00843D", kind: "national", confederation: "AFC", group: "G" },
  { id: "KSA", name: "Saudi Arabia", flag: "🇸🇦", color: "#006C35", kind: "national", confederation: "AFC", group: "D" },
  { id: "QAT", name: "Qatar", flag: "🇶🇦", color: "#8A1538", kind: "national", confederation: "AFC", group: "A" },
  { id: "UZB", name: "Uzbekistan", flag: "🇺🇿", color: "#0099B5", kind: "national", confederation: "AFC", group: "K" },
  { id: "JOR", name: "Jordan", flag: "🇯🇴", color: "#007A3D", kind: "national", confederation: "AFC", group: "F" },
  // CAF
  { id: "MAR", name: "Morocco", flag: "🇲🇦", color: "#C1272D", kind: "national", confederation: "CAF", group: "A" },
  { id: "SEN", name: "Senegal", flag: "🇸🇳", color: "#00853F", kind: "national", confederation: "CAF", group: "I" },
  { id: "EGY", name: "Egypt", flag: "🇪🇬", color: "#C8102E", kind: "national", confederation: "CAF", group: "E" },
  { id: "ALG", name: "Algeria", flag: "🇩🇿", color: "#006233", kind: "national", confederation: "CAF", group: "H" },
  { id: "TUN", name: "Tunisia", flag: "🇹🇳", color: "#E70013", kind: "national", confederation: "CAF", group: "D" },
  { id: "RSA", name: "South Africa", flag: "🇿🇦", color: "#007749", kind: "national", confederation: "CAF", group: "C" },
  { id: "CIV", name: "Ivory Coast", flag: "🇨🇮", color: "#F77F00", kind: "national", confederation: "CAF", group: "G" },
  { id: "GHA", name: "Ghana", flag: "🇬🇭", color: "#006B3F", kind: "national", confederation: "CAF", group: "J" },
  { id: "CPV", name: "Cape Verde", flag: "🇨🇻", color: "#003893", kind: "national", confederation: "CAF", group: "L" },
  // OFC
  { id: "NZL", name: "New Zealand", flag: "🇳🇿", color: "#000000", kind: "national", confederation: "OFC", group: "E" },
];

const TEAMS_BY_ID = new Map(TEAMS.map(t => [t.id, t]));

export const teams_repository = {
  find_all(): Team[] {
    return TEAMS;
  },
  find_by_id(id: string): Team | undefined {
    return TEAMS_BY_ID.get(id);
  },
};
