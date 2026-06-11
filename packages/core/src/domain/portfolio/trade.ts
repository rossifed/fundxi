export type TradeKind = "buy" | "sell";

export interface Trade {
  id: number;
  kind: TradeKind;
  player_id: number;
  player_name: string;
  team_id: string;
  shares: number;
  price: number; // €M per share
  date: string; // YYYY-MM-DD (execution day)
  time: string; // HH:MM (execution time of day)
  total: number; // €M total amount
}
