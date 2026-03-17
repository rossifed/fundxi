// ============================================================
// FundXI — Mock Data
// ============================================================

export type Position = "GK" | "CB" | "LB" | "RB" | "CDM" | "CM" | "CAM" | "LW" | "RW" | "ST";

export interface Player {
  id: string;
  name: string;
  number: number;
  team: string;
  teamId: string;
  position: Position;
  nationality: string;
  age: number;
  value: number;          // current value in M€
  previousValue: number;  // value 24h ago
  valueHistory: number[]; // last 10 data points
  stats: {
    goals: number;
    assists: number;
    matches: number;
    rating: number; // 0-10
  };
  image?: string;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  color: string;
  logo?: string;
}

export type FixtureStatus = "upcoming" | "live" | "finished";

export interface Fixture {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  status: FixtureStatus;
  date: string;
  score?: { home: number; away: number };
  minute?: number;
  homePlayers: string[]; // player IDs
  awayPlayers: string[]; // player IDs
  events: MatchEvent[];
}

export interface MatchEvent {
  minute: number;
  type: "goal" | "assist" | "yellow" | "red" | "substitution" | "commentary";
  playerId?: string;
  text: string;
}

export interface PortfolioHolding {
  playerId: string;
  quantity: number;
  avgBuyPrice: number;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  portfolioValue: number;
  pnl: number;
  pnlPercent: number;
}

// ============================================================
// Teams
// ============================================================

export const teams: Team[] = [
  { id: "psg", name: "Paris Saint-Germain", shortName: "PSG", color: "#004170" },
  { id: "rma", name: "Real Madrid", shortName: "RMA", color: "#FEBE10" },
  { id: "bar", name: "FC Barcelona", shortName: "BAR", color: "#A50044" },
  { id: "liv", name: "Liverpool FC", shortName: "LIV", color: "#C8102E" },
  { id: "mci", name: "Manchester City", shortName: "MCI", color: "#6CABDD" },
  { id: "bay", name: "Bayern Munich", shortName: "BAY", color: "#DC052D" },
];

// ============================================================
// Players
// ============================================================

function makeHistory(base: number): number[] {
  const h: number[] = [];
  let v = base * (0.85 + Math.random() * 0.1);
  for (let i = 0; i < 10; i++) {
    v += (Math.random() - 0.45) * base * 0.04;
    h.push(parseFloat(v.toFixed(1)));
  }
  return h;
}

export const players: Player[] = [
  // PSG
  { id: "p1", name: "Ousmane Dembélé", number: 10, team: "Paris Saint-Germain", teamId: "psg", position: "RW", nationality: "🇫🇷", age: 28, value: 72.0, previousValue: 70.5, valueHistory: makeHistory(72), stats: { goals: 12, assists: 9, matches: 28, rating: 7.8 } },
  { id: "p2", name: "Achraf Hakimi", number: 2, team: "Paris Saint-Germain", teamId: "psg", position: "RB", nationality: "🇲🇦", age: 27, value: 58.0, previousValue: 57.0, valueHistory: makeHistory(58), stats: { goals: 3, assists: 7, matches: 30, rating: 7.4 } },
  { id: "p3", name: "Marquinhos", number: 5, team: "Paris Saint-Germain", teamId: "psg", position: "CB", nationality: "🇧🇷", age: 31, value: 35.0, previousValue: 36.0, valueHistory: makeHistory(35), stats: { goals: 2, assists: 1, matches: 26, rating: 7.2 } },
  { id: "p4", name: "Gianluigi Donnarumma", number: 99, team: "Paris Saint-Germain", teamId: "psg", position: "GK", nationality: "🇮🇹", age: 27, value: 42.0, previousValue: 41.5, valueHistory: makeHistory(42), stats: { goals: 0, assists: 0, matches: 30, rating: 7.0 } },
  { id: "p5", name: "Vitinha", number: 17, team: "Paris Saint-Germain", teamId: "psg", position: "CM", nationality: "🇵🇹", age: 25, value: 65.0, previousValue: 63.0, valueHistory: makeHistory(65), stats: { goals: 6, assists: 8, matches: 29, rating: 7.6 } },
  { id: "p6", name: "Willian Pacho", number: 22, team: "Paris Saint-Germain", teamId: "psg", position: "CB", nationality: "🇪🇨", age: 23, value: 40.0, previousValue: 38.5, valueHistory: makeHistory(40), stats: { goals: 1, assists: 0, matches: 27, rating: 7.1 } },
  { id: "p7", name: "Bradley Barcola", number: 29, team: "Paris Saint-Germain", teamId: "psg", position: "LW", nationality: "🇫🇷", age: 22, value: 55.0, previousValue: 52.0, valueHistory: makeHistory(55), stats: { goals: 10, assists: 5, matches: 28, rating: 7.5 } },
  { id: "p8", name: "Warren Zaïre-Emery", number: 33, team: "Paris Saint-Germain", teamId: "psg", position: "CDM", nationality: "🇫🇷", age: 19, value: 48.0, previousValue: 46.0, valueHistory: makeHistory(48), stats: { goals: 3, assists: 4, matches: 25, rating: 7.3 } },
  { id: "p9", name: "Nuno Mendes", number: 25, team: "Paris Saint-Germain", teamId: "psg", position: "LB", nationality: "🇵🇹", age: 23, value: 45.0, previousValue: 44.0, valueHistory: makeHistory(45), stats: { goals: 1, assists: 6, matches: 24, rating: 7.2 } },
  { id: "p10", name: "Gonçalo Ramos", number: 9, team: "Paris Saint-Germain", teamId: "psg", position: "ST", nationality: "🇵🇹", age: 23, value: 50.0, previousValue: 48.0, valueHistory: makeHistory(50), stats: { goals: 8, assists: 3, matches: 20, rating: 7.1 } },
  { id: "p11", name: "Fabian Ruiz", number: 8, team: "Paris Saint-Germain", teamId: "psg", position: "CM", nationality: "🇪🇸", age: 29, value: 32.0, previousValue: 32.5, valueHistory: makeHistory(32), stats: { goals: 4, assists: 5, matches: 27, rating: 7.0 } },

  // Real Madrid
  { id: "p12", name: "Vinícius Júnior", number: 7, team: "Real Madrid", teamId: "rma", position: "LW", nationality: "🇧🇷", age: 25, value: 150.0, previousValue: 148.0, valueHistory: makeHistory(150), stats: { goals: 18, assists: 10, matches: 30, rating: 8.5 } },
  { id: "p13", name: "Jude Bellingham", number: 5, team: "Real Madrid", teamId: "rma", position: "CAM", nationality: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", age: 22, value: 130.0, previousValue: 128.0, valueHistory: makeHistory(130), stats: { goals: 15, assists: 8, matches: 29, rating: 8.3 } },
  { id: "p14", name: "Kylian Mbappé", number: 9, team: "Real Madrid", teamId: "rma", position: "ST", nationality: "🇫🇷", age: 27, value: 160.0, previousValue: 158.0, valueHistory: makeHistory(160), stats: { goals: 20, assists: 5, matches: 28, rating: 8.4 } },
  { id: "p15", name: "Thibaut Courtois", number: 1, team: "Real Madrid", teamId: "rma", position: "GK", nationality: "🇧🇪", age: 33, value: 30.0, previousValue: 30.5, valueHistory: makeHistory(30), stats: { goals: 0, assists: 0, matches: 25, rating: 7.5 } },
  { id: "p16", name: "Antonio Rüdiger", number: 22, team: "Real Madrid", teamId: "rma", position: "CB", nationality: "🇩🇪", age: 32, value: 28.0, previousValue: 28.5, valueHistory: makeHistory(28), stats: { goals: 2, assists: 0, matches: 27, rating: 7.3 } },
  { id: "p17", name: "Federico Valverde", number: 8, team: "Real Madrid", teamId: "rma", position: "CM", nationality: "🇺🇾", age: 27, value: 95.0, previousValue: 93.0, valueHistory: makeHistory(95), stats: { goals: 7, assists: 9, matches: 30, rating: 7.9 } },
  { id: "p18", name: "Éder Militão", number: 3, team: "Real Madrid", teamId: "rma", position: "CB", nationality: "🇧🇷", age: 27, value: 55.0, previousValue: 54.0, valueHistory: makeHistory(55), stats: { goals: 1, assists: 1, matches: 22, rating: 7.2 } },
  { id: "p19", name: "Rodrygo", number: 11, team: "Real Madrid", teamId: "rma", position: "RW", nationality: "🇧🇷", age: 25, value: 85.0, previousValue: 84.0, valueHistory: makeHistory(85), stats: { goals: 10, assists: 7, matches: 28, rating: 7.7 } },
  { id: "p20", name: "Eduardo Camavinga", number: 12, team: "Real Madrid", teamId: "rma", position: "CDM", nationality: "🇫🇷", age: 23, value: 70.0, previousValue: 68.0, valueHistory: makeHistory(70), stats: { goals: 2, assists: 5, matches: 26, rating: 7.4 } },
  { id: "p21", name: "Ferland Mendy", number: 23, team: "Real Madrid", teamId: "rma", position: "LB", nationality: "🇫🇷", age: 30, value: 25.0, previousValue: 25.5, valueHistory: makeHistory(25), stats: { goals: 0, assists: 3, matches: 24, rating: 7.0 } },
  { id: "p22", name: "Dani Carvajal", number: 2, team: "Real Madrid", teamId: "rma", position: "RB", nationality: "🇪🇸", age: 33, value: 18.0, previousValue: 19.0, valueHistory: makeHistory(18), stats: { goals: 1, assists: 4, matches: 15, rating: 7.1 } },

  // Barcelona
  { id: "p23", name: "Lamine Yamal", number: 19, team: "FC Barcelona", teamId: "bar", position: "RW", nationality: "🇪🇸", age: 18, value: 120.0, previousValue: 115.0, valueHistory: makeHistory(120), stats: { goals: 11, assists: 12, matches: 30, rating: 8.2 } },
  { id: "p24", name: "Raphinha", number: 11, team: "FC Barcelona", teamId: "bar", position: "LW", nationality: "🇧🇷", age: 29, value: 65.0, previousValue: 63.0, valueHistory: makeHistory(65), stats: { goals: 14, assists: 8, matches: 30, rating: 7.9 } },
  { id: "p25", name: "Robert Lewandowski", number: 9, team: "FC Barcelona", teamId: "bar", position: "ST", nationality: "🇵🇱", age: 37, value: 15.0, previousValue: 15.5, valueHistory: makeHistory(15), stats: { goals: 22, assists: 4, matches: 30, rating: 8.0 } },
  { id: "p26", name: "Pedri", number: 8, team: "FC Barcelona", teamId: "bar", position: "CM", nationality: "🇪🇸", age: 23, value: 90.0, previousValue: 88.0, valueHistory: makeHistory(90), stats: { goals: 5, assists: 10, matches: 24, rating: 7.8 } },
  { id: "p27", name: "Gavi", number: 6, team: "FC Barcelona", teamId: "bar", position: "CM", nationality: "🇪🇸", age: 21, value: 60.0, previousValue: 58.0, valueHistory: makeHistory(60), stats: { goals: 3, assists: 6, matches: 20, rating: 7.5 } },
  { id: "p28", name: "Marc-André ter Stegen", number: 1, team: "FC Barcelona", teamId: "bar", position: "GK", nationality: "🇩🇪", age: 34, value: 20.0, previousValue: 21.0, valueHistory: makeHistory(20), stats: { goals: 0, assists: 0, matches: 15, rating: 7.3 } },
  { id: "p29", name: "Jules Koundé", number: 23, team: "FC Barcelona", teamId: "bar", position: "RB", nationality: "🇫🇷", age: 27, value: 55.0, previousValue: 54.0, valueHistory: makeHistory(55), stats: { goals: 2, assists: 5, matches: 28, rating: 7.4 } },
  { id: "p30", name: "Ronald Araújo", number: 4, team: "FC Barcelona", teamId: "bar", position: "CB", nationality: "🇺🇾", age: 26, value: 50.0, previousValue: 49.0, valueHistory: makeHistory(50), stats: { goals: 1, assists: 0, matches: 18, rating: 7.2 } },
  { id: "p31", name: "Pau Cubarsí", number: 2, team: "FC Barcelona", teamId: "bar", position: "CB", nationality: "🇪🇸", age: 18, value: 45.0, previousValue: 42.0, valueHistory: makeHistory(45), stats: { goals: 0, assists: 1, matches: 26, rating: 7.3 } },
  { id: "p32", name: "Alejandro Balde", number: 3, team: "FC Barcelona", teamId: "bar", position: "LB", nationality: "🇪🇸", age: 22, value: 35.0, previousValue: 34.0, valueHistory: makeHistory(35), stats: { goals: 1, assists: 4, matches: 25, rating: 7.1 } },
  { id: "p33", name: "Frenkie de Jong", number: 21, team: "FC Barcelona", teamId: "bar", position: "CDM", nationality: "🇳🇱", age: 28, value: 45.0, previousValue: 46.0, valueHistory: makeHistory(45), stats: { goals: 2, assists: 5, matches: 22, rating: 7.2 } },

  // Liverpool
  { id: "p34", name: "Mohamed Salah", number: 11, team: "Liverpool FC", teamId: "liv", position: "RW", nationality: "🇪🇬", age: 33, value: 55.0, previousValue: 54.0, valueHistory: makeHistory(55), stats: { goals: 19, assists: 11, matches: 30, rating: 8.3 } },
  { id: "p35", name: "Virgil van Dijk", number: 4, team: "Liverpool FC", teamId: "liv", position: "CB", nationality: "🇳🇱", age: 34, value: 22.0, previousValue: 23.0, valueHistory: makeHistory(22), stats: { goals: 3, assists: 1, matches: 28, rating: 7.5 } },
  { id: "p36", name: "Alisson", number: 1, team: "Liverpool FC", teamId: "liv", position: "GK", nationality: "🇧🇷", age: 33, value: 28.0, previousValue: 28.5, valueHistory: makeHistory(28), stats: { goals: 0, assists: 0, matches: 24, rating: 7.4 } },
  { id: "p37", name: "Trent Alexander-Arnold", number: 66, team: "Liverpool FC", teamId: "liv", position: "RB", nationality: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", age: 27, value: 60.0, previousValue: 58.0, valueHistory: makeHistory(60), stats: { goals: 2, assists: 10, matches: 26, rating: 7.7 } },
  { id: "p38", name: "Luis Díaz", number: 7, team: "Liverpool FC", teamId: "liv", position: "LW", nationality: "🇨🇴", age: 29, value: 52.0, previousValue: 50.0, valueHistory: makeHistory(52), stats: { goals: 11, assists: 5, matches: 29, rating: 7.6 } },
  { id: "p39", name: "Alexis Mac Allister", number: 10, team: "Liverpool FC", teamId: "liv", position: "CM", nationality: "🇦🇷", age: 27, value: 68.0, previousValue: 66.0, valueHistory: makeHistory(68), stats: { goals: 5, assists: 7, matches: 28, rating: 7.5 } },
  { id: "p40", name: "Ryan Gravenberch", number: 38, team: "Liverpool FC", teamId: "liv", position: "CDM", nationality: "🇳🇱", age: 23, value: 50.0, previousValue: 47.0, valueHistory: makeHistory(50), stats: { goals: 3, assists: 4, matches: 30, rating: 7.4 } },
  { id: "p41", name: "Ibrahima Konaté", number: 5, team: "Liverpool FC", teamId: "liv", position: "CB", nationality: "🇫🇷", age: 26, value: 45.0, previousValue: 44.0, valueHistory: makeHistory(45), stats: { goals: 2, assists: 0, matches: 25, rating: 7.3 } },
  { id: "p42", name: "Andrew Robertson", number: 26, team: "Liverpool FC", teamId: "liv", position: "LB", nationality: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", age: 32, value: 18.0, previousValue: 18.5, valueHistory: makeHistory(18), stats: { goals: 1, assists: 6, matches: 24, rating: 7.1 } },
  { id: "p43", name: "Darwin Núñez", number: 9, team: "Liverpool FC", teamId: "liv", position: "ST", nationality: "🇺🇾", age: 27, value: 62.0, previousValue: 60.0, valueHistory: makeHistory(62), stats: { goals: 14, assists: 4, matches: 28, rating: 7.4 } },
  { id: "p44", name: "Dominik Szoboszlai", number: 8, team: "Liverpool FC", teamId: "liv", position: "CAM", nationality: "🇭🇺", age: 25, value: 55.0, previousValue: 53.0, valueHistory: makeHistory(55), stats: { goals: 6, assists: 8, matches: 27, rating: 7.3 } },
];

// ============================================================
// Fixtures
// ============================================================

export const fixtures: Fixture[] = [
  {
    id: "f1",
    homeTeam: teams[0], // PSG
    awayTeam: teams[1], // Real Madrid
    status: "live",
    date: "2026-03-17T21:00:00",
    score: { home: 1, away: 2 },
    minute: 67,
    homePlayers: ["p4", "p2", "p3", "p6", "p9", "p8", "p5", "p11", "p1", "p7", "p10"],
    awayPlayers: ["p15", "p22", "p16", "p18", "p21", "p20", "p17", "p19", "p13", "p12", "p14"],
    events: [
      { minute: 12, type: "goal", playerId: "p14", text: "⚽ GOAL! Mbappé opens the scoring with a clinical finish!" },
      { minute: 23, type: "commentary", text: "PSG pressing high, Vitinha controlling the tempo." },
      { minute: 34, type: "goal", playerId: "p7", text: "⚽ GOAL! Barcola equalizes with a superb left-footed strike!" },
      { minute: 38, type: "yellow", playerId: "p8", text: "🟨 Yellow card for Zaïre-Emery, late tackle on Valverde." },
      { minute: 45, type: "commentary", text: "Half-time: PSG 1-1 Real Madrid. Intense first half!" },
      { minute: 55, type: "goal", playerId: "p13", text: "⚽ GOAL! Bellingham heads in from Rodrygo's cross!" },
      { minute: 62, type: "commentary", text: "PSG pushing for the equalizer. Dembélé causing problems on the right." },
      { minute: 65, type: "substitution", playerId: "p11", text: "🔄 Fabian Ruiz off, fresh legs coming on for PSG." },
    ],
  },
  {
    id: "f2",
    homeTeam: teams[2], // Barcelona
    awayTeam: teams[3], // Liverpool
    status: "upcoming",
    date: "2026-03-18T21:00:00",
    homePlayers: ["p28", "p29", "p30", "p31", "p32", "p33", "p26", "p27", "p23", "p24", "p25"],
    awayPlayers: ["p36", "p37", "p35", "p41", "p42", "p40", "p39", "p44", "p34", "p38", "p43"],
    events: [],
  },
  {
    id: "f3",
    homeTeam: teams[4], // Man City
    awayTeam: teams[5], // Bayern
    status: "finished",
    date: "2026-03-16T21:00:00",
    score: { home: 3, away: 1 },
    homePlayers: [],
    awayPlayers: [],
    events: [
      { minute: 15, type: "goal", text: "⚽ Man City takes the lead!" },
      { minute: 38, type: "goal", text: "⚽ Bayern equalizes!" },
      { minute: 72, type: "goal", text: "⚽ Man City scores again!" },
      { minute: 88, type: "goal", text: "⚽ Man City seals the victory!" },
    ],
  },
  {
    id: "f4",
    homeTeam: teams[1], // Real Madrid
    awayTeam: teams[2], // Barcelona
    status: "upcoming",
    date: "2026-03-22T21:00:00",
    homePlayers: [],
    awayPlayers: [],
    events: [],
  },
  {
    id: "f5",
    homeTeam: teams[3], // Liverpool
    awayTeam: teams[0], // PSG
    status: "finished",
    date: "2026-03-10T21:00:00",
    score: { home: 2, away: 2 },
    homePlayers: [],
    awayPlayers: [],
    events: [
      { minute: 20, type: "goal", text: "⚽ Liverpool opens the scoring!" },
      { minute: 45, type: "goal", text: "⚽ PSG equalizes before half-time!" },
      { minute: 60, type: "goal", text: "⚽ PSG takes the lead!" },
      { minute: 85, type: "goal", text: "⚽ Liverpool with a late equalizer!" },
    ],
  },
];

// ============================================================
// Portfolio & Leaderboard (mock current user)
// ============================================================

export const myPortfolio: PortfolioHolding[] = [
  { playerId: "p14", quantity: 2, avgBuyPrice: 155.0 },
  { playerId: "p23", quantity: 3, avgBuyPrice: 110.0 },
  { playerId: "p5", quantity: 5, avgBuyPrice: 60.0 },
  { playerId: "p34", quantity: 2, avgBuyPrice: 52.0 },
  { playerId: "p40", quantity: 4, avgBuyPrice: 44.0 },
];

export const leaderboard: LeaderboardEntry[] = [
  { rank: 1, username: "AlphaTrader", portfolioValue: 12450, pnl: 2450, pnlPercent: 24.5 },
  { rank: 2, username: "GoalDigger", portfolioValue: 11800, pnl: 1800, pnlPercent: 18.0 },
  { rank: 3, username: "You", portfolioValue: 11200, pnl: 1200, pnlPercent: 12.0 },
  { rank: 4, username: "FootballFund", portfolioValue: 10900, pnl: 900, pnlPercent: 9.0 },
  { rank: 5, username: "StatsBoss", portfolioValue: 10650, pnl: 650, pnlPercent: 6.5 },
  { rank: 6, username: "PitchInvestor", portfolioValue: 10400, pnl: 400, pnlPercent: 4.0 },
  { rank: 7, username: "TikiTaka", portfolioValue: 10100, pnl: 100, pnlPercent: 1.0 },
  { rank: 8, username: "CounterPress", portfolioValue: 9800, pnl: -200, pnlPercent: -2.0 },
  { rank: 9, username: "CrossMerchant", portfolioValue: 9500, pnl: -500, pnlPercent: -5.0 },
  { rank: 10, username: "BenchWarmer", portfolioValue: 9100, pnl: -900, pnlPercent: -9.0 },
];

// ============================================================
// Helpers
// ============================================================

export function getPlayer(id: string): Player | undefined {
  return players.find((p) => p.id === id);
}

export function getFixture(id: string): Fixture | undefined {
  return fixtures.find((f) => f.id === id);
}

export function getTeamPlayers(teamId: string): Player[] {
  return players.filter((p) => p.teamId === teamId);
}

export function formatValue(v: number): string {
  return `€${v.toFixed(1)}M`;
}

export function pnlColor(v: number): string {
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-gray-400";
}

export function pnlSign(v: number): string {
  return v > 0 ? "+" : "";
}

// Position coordinates on pitch (percentage-based, for 4-3-3)
export const positionCoords: Record<Position, { x: number; y: number }> = {
  GK:  { x: 50, y: 92 },
  LB:  { x: 15, y: 72 },
  CB:  { x: 38, y: 78 },
  RB:  { x: 85, y: 72 },
  CDM: { x: 50, y: 58 },
  CM:  { x: 32, y: 48 },
  CAM: { x: 50, y: 38 },
  LW:  { x: 18, y: 25 },
  RW:  { x: 82, y: 25 },
  ST:  { x: 50, y: 12 },
};

// Inverted coords for away team
export function awayCoords(pos: Position): { x: number; y: number } {
  const c = positionCoords[pos];
  return { x: 100 - c.x, y: 100 - c.y };
}
