import type { Trade } from "@/domain/portfolio/trade";
import { api_post } from "@/infrastructure/api_post";
import {
  refresh_portfolio,
  _set_from_outcome,
} from "@/infrastructure/repositories/portfolio_repository";
import { refresh_trades, trades_repository } from "@/infrastructure/repositories/trades_repository";

interface TradeOutcomeDTO {
  trade: {
    id: number;
    portfolio_id: number;
    player_id: number;
    kind: "buy" | "sell";
    shares: number;
    price: number;
    total: number;
    executed_at: string;
  };
  portfolio: {
    id: number;
    user_id: number;
    cash: number;
    holdings: { player_id: number; shares: number; average_buy_price: number }[];
  };
}

export interface ExecuteTradeInput {
  player_id: number;
  kind: "buy" | "sell";
  shares: number;
  price: number;
}

export const trades_api = {
  list(): Trade[] {
    return trades_repository.find_all();
  },
  /** Execute a buy/sell, refresh local caches. Throws on backend error. */
  async execute(input: ExecuteTradeInput): Promise<TradeOutcomeDTO> {
    const outcome = await api_post<TradeOutcomeDTO, ExecuteTradeInput>("/api/trades", input);
    _set_from_outcome(outcome.portfolio);
    await refresh_trades();
    // refresh_portfolio is implicit through _set_from_outcome's listener
    // notify, but call it as a defensive freshness guarantee.
    await refresh_portfolio();
    return outcome;
  },
};
