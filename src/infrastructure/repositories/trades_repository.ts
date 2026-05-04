import type { Trade } from "@/domain/portfolio/trade";

const TRADES: Trade[] = [
  { id: 1, kind: "buy", player_id: 7, player_name: "Mbappé", team_id: "FRA", shares: 20, price: 168, date: "Jun 12", total: 3360 },
  { id: 2, kind: "buy", player_id: 26, player_name: "Haaland", team_id: "NOR", shares: 15, price: 170, date: "Jun 12", total: 2550 },
  { id: 3, kind: "sell", player_id: 13, player_name: "Saka", team_id: "ENG", shares: 30, price: 138, date: "Jun 13", total: 4140 },
  { id: 4, kind: "buy", player_id: 16, player_name: "Yamal", team_id: "ESP", shares: 40, price: 125, date: "Jun 13", total: 5000 },
  { id: 5, kind: "buy", player_id: 39, player_name: "Marmoush", team_id: "EGY", shares: 50, price: 48, date: "Jun 14", total: 2400 },
  { id: 6, kind: "sell", player_id: 23, player_name: "Ronaldo", team_id: "POR", shares: 25, price: 62, date: "Jun 14", total: 1550 },
  { id: 7, kind: "buy", player_id: 7, player_name: "Mbappé", team_id: "FRA", shares: 30, price: 175, date: "Jun 15", total: 5250 },
  { id: 8, kind: "buy", player_id: 31, player_name: "Gvardiol", team_id: "CRO", shares: 65, price: 68, date: "Jun 15", total: 4420 },
  { id: 9, kind: "sell", player_id: 45, player_name: "De Bruyne", team_id: "BEL", shares: 20, price: 84, date: "Jun 16", total: 1680 },
  { id: 10, kind: "buy", player_id: 6, player_name: "Endrick", team_id: "BRA", shares: 60, price: 52, date: "Jun 16", total: 3120 },
];

export const trades_repository = {
  find_all(): Trade[] {
    return TRADES;
  },
};
