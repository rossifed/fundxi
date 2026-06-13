export type TradeKind = "buy" | "sell";

export interface Trade {
  id: number;
  kind: TradeKind;
  player_id: number;
  player_name: string;
  team_id: string;
  shares: number; // ownership fraction traded (1.0 = the whole player)
  price: number; // €M — the player's WHOLE value (mkt cap) at execution; per-share = price / N
  date: string; // YYYY-MM-DD (execution day)
  time: string; // HH:MM (execution time of day)
  total: number; // €M total amount
}
