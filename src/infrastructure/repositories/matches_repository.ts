import type { Match, MatchPlayer, MatchEvent } from "@/domain/match/match";

// Team colors used on the pitch (national team primary color shorthand)
export const FRA_COLOR = "#002395";
export const COL_COLOR = "#FCD116";

// Colombia starting XI used inside LIVE_MATCH home/away rosters.
const COL_XI: MatchPlayer[] = [
  { id: 47, name: "L. Díaz", jersey_number: 7, position: "FW", value: 75, change_24h: -1.8, rating: 85, team_id: "COL", tags: ["Dribbling"] },
  { id: 70, name: "Arias", jersey_number: 11, position: "FW", value: 42, change_24h: 1.2, rating: 79, team_id: "COL", tags: ["Pace"] },
  { id: 71, name: "R. Ríos", jersey_number: 14, position: "MF", value: 38, change_24h: 2.5, rating: 78, team_id: "COL", tags: ["Passing"] },
  { id: 72, name: "Lerma", jersey_number: 6, position: "MF", value: 30, change_24h: 0.5, rating: 76, team_id: "COL", tags: ["Tackling"] },
  { id: 73, name: "James", jersey_number: 10, position: "MF", value: 22, change_24h: -1.5, rating: 80, team_id: "COL", tags: ["Vision"] },
  { id: 74, name: "D. Sánchez", jersey_number: 23, position: "DF", value: 28, change_24h: 0.3, rating: 77, team_id: "COL", tags: ["Aerial"] },
  { id: 75, name: "Lucumí", jersey_number: 4, position: "DF", value: 32, change_24h: 1.0, rating: 78, team_id: "COL", tags: ["Composure"] },
  { id: 76, name: "Mojica", jersey_number: 17, position: "DF", value: 18, change_24h: 0.2, rating: 74, team_id: "COL", tags: ["Overlapping"] },
  { id: 77, name: "Muñoz", jersey_number: 2, position: "DF", value: 25, change_24h: 1.5, rating: 76, team_id: "COL", tags: ["Energy"] },
  { id: 78, name: "Córdoba", jersey_number: 9, position: "FW", value: 35, change_24h: 2.0, rating: 78, team_id: "COL", tags: ["Movement"] },
  { id: 79, name: "Vargas", jersey_number: 1, position: "GK", value: 12, change_24h: 0.1, rating: 74, team_id: "COL", tags: ["Reflexes"] },
];

const LIVE_MATCH_FRA_COL: Match = {
  home_team_id: "FRA",
  away_team_id: "COL",
  home_score: 2,
  away_score: 1,
  minute: 72,
  group: "D",
  status: "live",
  // Mix of player IDs (resolved via players_repository) and inline subs.
  home_xi: [
    7, 8, 9, 10, 11, 51, 60, 61, 62, 63,
    { id: 99, name: "Griezmann", full_name: "Antoine Griezmann", jersey_number: 17, position: "MF", value: 55, change_24h: 0.9, rating: 84, team_id: "FRA", tags: ["Link-up"] },
  ],
  away_xi: COL_XI,
  player_changes: {
    7: 3.2, 8: 1.1, 9: 0.5, 10: 1.5, 11: 1.8, 51: 0.8, 60: 0.3, 61: -0.2, 62: 0.6, 63: 0.4, 99: 0.9,
    47: -1.8, 70: -0.5, 71: 0.3, 72: -0.8, 73: -1.2, 74: -0.6, 75: 0.2, 76: -0.3, 77: 0.1, 78: 0.6, 79: -0.4,
  },
  events: [
    { minute: 12, type: "⚽", player_name: "Mbappé", player_id: 7, team_id: "FRA", comment: "Left foot, far post" },
    { minute: 34, type: "⚽", player_name: "L. Díaz", player_id: 47, team_id: "COL", comment: "Counter-attack" },
    { minute: 41, type: "🟨", player_name: "Lerma", player_id: 72, team_id: "COL", comment: "Late challenge on Tchouaméni" },
    { minute: 58, type: "⚽", player_name: "Mbappé", player_id: 7, team_id: "FRA", comment: "Penalty conversion" },
    { minute: 65, type: "🟨", player_name: "Camavinga", player_id: 10, team_id: "FRA", comment: "Tactical foul" },
    { minute: 70, type: "🔄", player_name: "Barcola → Dembélé", player_id: 9, team_id: "FRA", comment: "Substitution" },
  ],
  player_curves: {
    7: [{ minute: 0, performance: 0 }, { minute: 12, performance: 1.8 }, { minute: 30, performance: 2.0 }, { minute: 45, performance: 2.2 }, { minute: 58, performance: 3.2 }, { minute: 72, performance: 3.2 }],
    47: [{ minute: 0, performance: 0 }, { minute: 20, performance: -0.3 }, { minute: 34, performance: 1.5 }, { minute: 50, performance: 1.0 }, { minute: 60, performance: -0.8 }, { minute: 72, performance: -1.8 }],
    10: [{ minute: 0, performance: 0 }, { minute: 30, performance: 0.5 }, { minute: 50, performance: 1.0 }, { minute: 65, performance: 0.2 }, { minute: 72, performance: 1.5 }],
    51: [{ minute: 0, performance: 0 }, { minute: 20, performance: 0.3 }, { minute: 45, performance: 0.5 }, { minute: 60, performance: 0.7 }, { minute: 72, performance: 0.8 }],
  },
};

const FT_MATCH_NOR_KOR: Match = {
  home_team_id: "NOR",
  away_team_id: "KOR",
  home_score: 3,
  away_score: 2,
  minute: 90,
  group: "H",
  status: "finished",
  home_xi: [
    26, 27,
    { id: 80, name: "Sørloth", jersey_number: 11, position: "FW", value: 32, change_24h: 4.5, rating: 79, team_id: "NOR", tags: ["Aerial"] },
    { id: 81, name: "Berge", jersey_number: 6, position: "MF", value: 28, change_24h: 1.2, rating: 78, team_id: "NOR", tags: ["Box-to-Box"] },
    { id: 82, name: "Ajer", jersey_number: 3, position: "DF", value: 22, change_24h: 0.8, rating: 77, team_id: "NOR", tags: ["Ball Playing"] },
    { id: 83, name: "Nyland", jersey_number: 1, position: "GK", value: 8, change_24h: 0.2, rating: 74, team_id: "NOR", tags: ["Reflexes"] },
    { id: 84, name: "Ryerson", jersey_number: 2, position: "DF", value: 18, change_24h: 1.5, rating: 76, team_id: "NOR", tags: ["Overlapping"] },
    { id: 85, name: "Ostigard", jersey_number: 5, position: "DF", value: 15, change_24h: -0.5, rating: 75, team_id: "NOR", tags: ["Aerial"] },
    { id: 86, name: "Myhre J.", jersey_number: 15, position: "DF", value: 10, change_24h: 0.3, rating: 73, team_id: "NOR", tags: ["Defensive"] },
    { id: 87, name: "Thorsby", jersey_number: 14, position: "MF", value: 12, change_24h: 0.5, rating: 74, team_id: "NOR", tags: ["Pressing"] },
    { id: 88, name: "Hauge", jersey_number: 17, position: "FW", value: 15, change_24h: 2.0, rating: 75, team_id: "NOR", tags: ["Dribbling"] },
  ],
  away_xi: [
    { id: 36, name: "Son", jersey_number: 7, position: "FW", value: 72, change_24h: 0.5, rating: 87, team_id: "KOR", tags: ["Finishing"] },
    { id: 37, name: "Kim", jersey_number: 3, position: "DF", value: 65, change_24h: 2.0, rating: 86, team_id: "KOR", tags: ["Tackling"] },
    { id: 89, name: "Hwang H.", jersey_number: 11, position: "FW", value: 35, change_24h: -1.0, rating: 80, team_id: "KOR", tags: ["Pace"] },
    { id: 90, name: "Lee K.", jersey_number: 10, position: "MF", value: 45, change_24h: 1.5, rating: 82, team_id: "KOR", tags: ["Creativity"] },
    { id: 91, name: "Hwang I.", jersey_number: 8, position: "MF", value: 22, change_24h: 0.8, rating: 77, team_id: "KOR", tags: ["Box-to-Box"] },
    { id: 92, name: "Jung W.", jersey_number: 6, position: "MF", value: 18, change_24h: -0.3, rating: 75, team_id: "KOR", tags: ["Tackling"] },
    { id: 93, name: "Kim J.", jersey_number: 22, position: "DF", value: 15, change_24h: 0.5, rating: 74, team_id: "KOR", tags: ["Pace"] },
    { id: 94, name: "Cho Y.", jersey_number: 16, position: "DF", value: 12, change_24h: -0.8, rating: 73, team_id: "KOR", tags: ["Positioning"] },
    { id: 95, name: "Hong C.", jersey_number: 5, position: "DF", value: 14, change_24h: -1.2, rating: 74, team_id: "KOR", tags: ["Aerial"] },
    { id: 96, name: "Kim S.", jersey_number: 1, position: "GK", value: 10, change_24h: -0.5, rating: 75, team_id: "KOR", tags: ["Reflexes"] },
    { id: 97, name: "Lee J.", jersey_number: 19, position: "DF", value: 12, change_24h: 0.3, rating: 73, team_id: "KOR", tags: ["Tackling"] },
  ],
  player_changes: { 26: 5.8, 27: 2.5, 80: 4.5, 36: -1.5, 37: -0.8, 89: -1.0, 90: 1.5 },
  events: [
    { minute: 8, type: "⚽", player_name: "Haaland", player_id: 26, team_id: "NOR", comment: "Header from Ødegaard cross" },
    { minute: 23, type: "⚽", player_name: "Son", player_id: 36, team_id: "KOR", comment: "Cut inside, curled far corner" },
    { minute: 31, type: "🟨", player_name: "Jung W.", player_id: 92, team_id: "KOR", comment: "Foul on Ødegaard" },
    { minute: 38, type: "⚽", player_name: "Haaland", player_id: 26, team_id: "NOR", comment: "Tap-in after Sørloth flick" },
    { minute: 52, type: "⚽", player_name: "Sørloth", player_id: 80, team_id: "NOR", comment: "Powerful strike from edge" },
    { minute: 67, type: "⚽", player_name: "Hwang H.", player_id: 89, team_id: "KOR", comment: "Quick counter" },
    { minute: 85, type: "🟨", player_name: "Kim Min-jae", player_id: 37, team_id: "KOR", comment: "Time wasting" },
  ],
  player_curves: {
    26: [{ minute: 0, performance: 0 }, { minute: 8, performance: 2.8 }, { minute: 38, performance: 5.2 }, { minute: 90, performance: 5.8 }],
    36: [{ minute: 0, performance: 0 }, { minute: 23, performance: 2.0 }, { minute: 45, performance: 1.8 }, { minute: 90, performance: -1.5 }],
  },
};

const MATCHES: Record<string, Match> = {
  FRA_COL: LIVE_MATCH_FRA_COL,
  NOR_KOR: FT_MATCH_NOR_KOR,
};

// ── Pitch view dataset (FRA vs COL match — visualization-focused lineups with team colors) ──

export const FRA_PITCH_XI: (MatchPlayer & { team_color: string })[] = [
  { id: 63, name: "Maignan", jersey_number: 1, position: "GK", value: 48, rating: 87, team_color: FRA_COLOR },
  { id: 61, name: "T. Hernández", jersey_number: 22, position: "DF", value: 62, rating: 84, team_color: FRA_COLOR },
  { id: 51, name: "Saliba", jersey_number: 2, position: "DF", value: 85, rating: 88, team_color: FRA_COLOR },
  { id: 60, name: "Upamecano", jersey_number: 4, position: "DF", value: 55, rating: 83, team_color: FRA_COLOR },
  { id: 62, name: "Koundé", jersey_number: 5, position: "DF", value: 60, rating: 85, team_color: FRA_COLOR },
  { id: 9, name: "Barcola", jersey_number: 29, position: "MF", value: 62, rating: 83, team_color: FRA_COLOR },
  { id: 10, name: "Camavinga", jersey_number: 12, position: "MF", value: 78, rating: 85, team_color: FRA_COLOR },
  { id: 11, name: "Tchouaméni", jersey_number: 8, position: "MF", value: 88, rating: 87, team_color: FRA_COLOR },
  { id: 99, name: "Griezmann", jersey_number: 17, position: "MF", value: 55, rating: 84, team_color: FRA_COLOR },
  { id: 7, name: "Mbappé", jersey_number: 10, position: "FW", value: 195, rating: 95, team_color: FRA_COLOR },
  { id: 8, name: "Dembélé", jersey_number: 11, position: "FW", value: 82, rating: 86, team_color: FRA_COLOR },
];

export const FRA_PITCH_SUBS: (MatchPlayer & { team_color: string })[] = [
  { id: 200, name: "Areola", jersey_number: 16, position: "GK", value: 12, rating: 76, team_color: FRA_COLOR },
  { id: 201, name: "Pavard", jersey_number: 3, position: "DF", value: 35, rating: 80, team_color: FRA_COLOR },
  { id: 202, name: "Konaté", jersey_number: 13, position: "DF", value: 50, rating: 83, team_color: FRA_COLOR },
  { id: 203, name: "Mendy", jersey_number: 23, position: "DF", value: 28, rating: 78, team_color: FRA_COLOR },
  { id: 204, name: "Kanté", jersey_number: 6, position: "MF", value: 32, rating: 81, team_color: FRA_COLOR },
  { id: 205, name: "Rabiot", jersey_number: 14, position: "MF", value: 30, rating: 79, team_color: FRA_COLOR },
  { id: 206, name: "Fofana", jersey_number: 19, position: "MF", value: 42, rating: 80, team_color: FRA_COLOR },
  { id: 207, name: "Coman", jersey_number: 20, position: "FW", value: 38, rating: 80, team_color: FRA_COLOR },
  { id: 208, name: "Thuram", jersey_number: 15, position: "FW", value: 65, rating: 83, team_color: FRA_COLOR },
  { id: 209, name: "Giroud", jersey_number: 9, position: "FW", value: 15, rating: 77, team_color: FRA_COLOR },
  { id: 210, name: "O. Dembélé", jersey_number: 7, position: "FW", value: 45, rating: 81, team_color: FRA_COLOR },
];

export const COL_PITCH_XI: (MatchPlayer & { team_color: string })[] = [
  { id: 79, name: "Vargas", jersey_number: 1, position: "GK", value: 12, rating: 74, team_color: COL_COLOR },
  { id: 74, name: "D. Sánchez", jersey_number: 23, position: "DF", value: 28, rating: 77, team_color: COL_COLOR },
  { id: 75, name: "Lucumí", jersey_number: 4, position: "DF", value: 32, rating: 78, team_color: COL_COLOR },
  { id: 77, name: "Muñoz", jersey_number: 2, position: "DF", value: 25, rating: 76, team_color: COL_COLOR },
  { id: 76, name: "Mojica", jersey_number: 17, position: "DF", value: 18, rating: 74, team_color: COL_COLOR },
  { id: 71, name: "R. Ríos", jersey_number: 14, position: "MF", value: 38, rating: 78, team_color: COL_COLOR },
  { id: 72, name: "Lerma", jersey_number: 6, position: "MF", value: 30, rating: 76, team_color: COL_COLOR },
  { id: 73, name: "James", jersey_number: 10, position: "MF", value: 22, rating: 80, team_color: COL_COLOR },
  { id: 70, name: "Arias", jersey_number: 11, position: "MF", value: 42, rating: 79, team_color: COL_COLOR },
  { id: 47, name: "L. Díaz", jersey_number: 7, position: "FW", value: 75, rating: 85, team_color: COL_COLOR },
  { id: 78, name: "Córdoba", jersey_number: 9, position: "FW", value: 35, rating: 78, team_color: COL_COLOR },
];

export const COL_PITCH_SUBS: (MatchPlayer & { team_color: string })[] = [
  { id: 300, name: "Ospina", jersey_number: 12, position: "GK", value: 8, rating: 73, team_color: COL_COLOR },
  { id: 301, name: "Cuesta", jersey_number: 15, position: "DF", value: 14, rating: 74, team_color: COL_COLOR },
  { id: 302, name: "Borré", jersey_number: 19, position: "FW", value: 22, rating: 76, team_color: COL_COLOR },
  { id: 303, name: "Sinisterra", jersey_number: 18, position: "FW", value: 30, rating: 78, team_color: COL_COLOR },
  { id: 304, name: "Quintero", jersey_number: 8, position: "MF", value: 15, rating: 76, team_color: COL_COLOR },
  { id: 305, name: "Uribe", jersey_number: 16, position: "MF", value: 18, rating: 75, team_color: COL_COLOR },
  { id: 306, name: "Mina", jersey_number: 13, position: "DF", value: 20, rating: 76, team_color: COL_COLOR },
  { id: 307, name: "Machado", jersey_number: 3, position: "DF", value: 10, rating: 72, team_color: COL_COLOR },
  { id: 308, name: "Cuadrado", jersey_number: 20, position: "MF", value: 12, rating: 75, team_color: COL_COLOR },
  { id: 309, name: "Durán", jersey_number: 21, position: "FW", value: 28, rating: 77, team_color: COL_COLOR },
  { id: 310, name: "Montero", jersey_number: 22, position: "DF", value: 8, rating: 71, team_color: COL_COLOR },
];

const MATCH_FEED_FRA_COL: MatchEvent[] = [
  { minute: 70, type: "🔄", player_id: 9, headline: "Substitution", comment: "Barcola makes way for Dembélé." },
  { minute: 65, type: "🟨", player_id: 10, headline: "Yellow Card", comment: "Cynical foul on James driving forward." },
  { minute: 58, type: "⚽", player_id: 7, headline: "GOAL! France 2-1", comment: "Mbappé sends Vargas the wrong way from the spot." },
  { minute: 55, type: "📊", player_id: 7, headline: "Penalty Won", comment: "Mbappé brought down by Lucumí. Clear penalty." },
  { minute: 41, type: "🟨", player_id: 72, headline: "Yellow Card", comment: "Reckless challenge on Tchouaméni." },
  { minute: 34, type: "⚽", player_id: 47, headline: "GOAL! France 1-1", comment: "Brilliant counter! Díaz slots past Maignan." },
  { minute: 18, type: "🧤", player_id: 63, headline: "Great Save", comment: "Maignan flies across and tips Díaz's effort wide." },
  { minute: 12, type: "⚽", player_id: 7, headline: "GOAL! France 1-0", comment: "Mbappé guides Griezmann's cross in with his left foot." },
];

export const matches_repository = {
  find_all(): Match[] {
    return Object.values(MATCHES);
  },
  find_by_teams(home_team_id: string, away_team_id: string): Match | undefined {
    return MATCHES[`${home_team_id}_${away_team_id}`];
  },
  get_live_match(): Match | undefined {
    return Object.values(MATCHES).find(m => m.status === "live");
  },
  get_match_feed(home_team_id: string, away_team_id: string): MatchEvent[] {
    if (home_team_id === "FRA" && away_team_id === "COL") return MATCH_FEED_FRA_COL;
    return [];
  },
};
