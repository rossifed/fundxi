import type { League } from "@/domain/league/league";

const LEAGUES: League[] = [
  {
    id: "global",
    name: "Global",
    icon: "🌍",
    description: "All FundXI players worldwide",
    member_count: 12847,
    is_public: true,
    leaderboard: [
      { rank: 1, name: "ElGauchito", value: 14250, return_pct: 42.5, avatar: "🏆" },
      { rank: 2, name: "SambaCapital", value: 13100, return_pct: 31.0, avatar: "⚡" },
      { rank: 3, name: "You", value: 12400, return_pct: 24.0, avatar: "🎯", is_me: true },
      { rank: 4, name: "FuryInvestor", value: 11800, return_pct: 18.0, avatar: "🦁" },
      { rank: 5, name: "TotalFootball", value: 11200, return_pct: 12.0, avatar: "📊" },
      { rank: 6, name: "PressingHigh", value: 10600, return_pct: 6.0, avatar: "🧠" },
      { rank: 7, name: "TikiTaka", value: 10100, return_pct: 1.0, avatar: "🔄" },
      { rank: 8, name: "Counter", value: 9700, return_pct: -3.0, avatar: "🏃" },
    ],
  },
  {
    id: "top100",
    name: "Top 100",
    icon: "💎",
    description: "Top 100 traders by return",
    member_count: 100,
    is_public: true,
    leaderboard: [
      { rank: 1, name: "ElGauchito", value: 14250, return_pct: 42.5, avatar: "🏆" },
      { rank: 2, name: "SambaCapital", value: 13100, return_pct: 31.0, avatar: "⚡" },
      { rank: 3, name: "AlphaTrader", value: 12900, return_pct: 29.0, avatar: "🔥" },
      { rank: 4, name: "You", value: 12400, return_pct: 24.0, avatar: "🎯", is_me: true },
      { rank: 5, name: "PitchBoss", value: 12100, return_pct: 21.0, avatar: "⭐" },
    ],
  },
  {
    id: "friends1",
    name: "La Bande",
    icon: "🇫🇷",
    description: "Private league with friends",
    member_count: 6,
    is_public: false,
    invite_code: "BANDE26",
    leaderboard: [
      { rank: 1, name: "You", value: 12400, return_pct: 24.0, avatar: "🎯", is_me: true },
      { rank: 2, name: "Karim", value: 11600, return_pct: 16.0, avatar: "🔥" },
      { rank: 3, name: "Sofiane", value: 10800, return_pct: 8.0, avatar: "⚡" },
      { rank: 4, name: "Amine", value: 10200, return_pct: 2.0, avatar: "😤" },
      { rank: 5, name: "Yassine", value: 9400, return_pct: -6.0, avatar: "💀" },
      { rank: 6, name: "Mehdi", value: 8900, return_pct: -11.0, avatar: "📉" },
    ],
  },
  {
    id: "work1",
    name: "Goldman XI",
    icon: "🏦",
    description: "Office league — Goldman Sachs",
    member_count: 14,
    is_public: false,
    invite_code: "GS2026X",
    leaderboard: [
      { rank: 1, name: "DeskAlpha", value: 15200, return_pct: 52.0, avatar: "💰" },
      { rank: 2, name: "StructuredMike", value: 14100, return_pct: 41.0, avatar: "📊" },
      { rank: 3, name: "You", value: 12400, return_pct: 24.0, avatar: "🎯", is_me: true },
      { rank: 4, name: "DerivQueen", value: 12000, return_pct: 20.0, avatar: "👑" },
      { rank: 5, name: "JuniorTrader", value: 11500, return_pct: 15.0, avatar: "📈" },
      { rank: 6, name: "InternLuck", value: 10900, return_pct: 9.0, avatar: "🍀" },
      { rank: 7, name: "BackOffice", value: 9800, return_pct: -2.0, avatar: "🤷" },
    ],
  },
];

export const leagues_repository = {
  find_all(): League[] {
    return LEAGUES;
  },
  find_by_id(id: string): League | undefined {
    return LEAGUES.find(l => l.id === id);
  },
};
