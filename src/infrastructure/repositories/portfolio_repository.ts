import type { Holding } from "@/domain/portfolio/holding";

const MY_HOLDINGS: Holding[] = [
  { player_id: 7, shares: 50, average_buy_price: 172 },
  { player_id: 26, shares: 40, average_buy_price: 168 },
  { player_id: 16, shares: 80, average_buy_price: 125 },
  { player_id: 12, shares: 45, average_buy_price: 148 },
  { player_id: 4, shares: 60, average_buy_price: 152 },
  { player_id: 18, shares: 55, average_buy_price: 118 },
  { player_id: 51, shares: 70, average_buy_price: 72 },
  { player_id: 32, shares: 90, average_buy_price: 62 },
  { player_id: 39, shares: 100, average_buy_price: 48 },
  { player_id: 6, shares: 120, average_buy_price: 52 },
  { player_id: 31, shares: 65, average_buy_price: 68 },
  { player_id: 53, shares: 80, average_buy_price: 40 },
];

// Cash available for new trades (buying power). Same unit as PlayerValuation.current_price.
const MY_CASH_AVAILABLE = 15000;

export const portfolio_repository = {
  find_my_holdings(): Holding[] {
    return MY_HOLDINGS;
  },
  find_my_cash(): number {
    return MY_CASH_AVAILABLE;
  },
};
