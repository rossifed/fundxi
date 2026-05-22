import {
  close_positions as run_close_positions,
  closing_trade,
  type CloseOutcome,
  type PositionToClose,
} from "@/application/close_positions";
import type { Trade } from "@/domain/portfolio/trade";
import { api_post } from "@/infrastructure/api_client";
import {
  refresh_portfolio,
  _set_from_outcome,
} from "@/infrastructure/repositories/portfolio_repository";
import { refresh_trades, trades_repository } from "@/infrastructure/repositories/trades_repository";

export type { CloseOutcome, PositionToClose } from "@/application/close_positions";

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
    const outcome = await api_post<TradeOutcomeDTO>("/api/trades", input);
    _set_from_outcome(outcome.portfolio);
    await refresh_trades();
    // refresh_portfolio is implicit through _set_from_outcome's listener
    // notify, but call it as a defensive freshness guarantee.
    await refresh_portfolio();
    return outcome;
  },
  /** Close ("flatten") a batch of positions — a long is sold, a short
   * is bought back to cover (see ``closing_trade``). Refreshes the local
   * caches once, after the batch, rather than per trade. Never throws on
   * a per-position failure: the ``CloseOutcome`` partitions the input
   * into closed vs failed. */
  async close_positions(positions: PositionToClose[]): Promise<CloseOutcome> {
    const outcome = await run_close_positions(positions, async pos => {
      const { kind, shares } = closing_trade(pos);
      await api_post<TradeOutcomeDTO>("/api/trades", {
        player_id: pos.player_id,
        kind,
        shares,
        price: pos.price,
      });
    });
    if (outcome.closed.length > 0) {
      await refresh_trades();
      await refresh_portfolio();
    }
    return outcome;
  },
};
