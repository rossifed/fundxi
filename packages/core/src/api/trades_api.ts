import {
  type BasketBuy,
  type BasketOutcome,
  execute_basket as run_execute_basket,
} from "@fundxi/core/application/basket_service";
import {
  close_positions as run_close_positions,
  closing_trade,
  type CloseOutcome,
  type PositionToClose,
} from "@fundxi/core/application/close_positions";
import type { Trade } from "@fundxi/core/domain/portfolio/trade";
import { api_post } from "@fundxi/core/infrastructure/api_client";
import {
  refresh_portfolio,
  _set_from_outcome,
} from "@fundxi/core/infrastructure/repositories/portfolio_repository";
import { refresh_trades, trades_repository } from "@fundxi/core/infrastructure/repositories/trades_repository";

export type { CloseOutcome, PositionToClose } from "@fundxi/core/application/close_positions";
export type { BasketBuy, BasketOutcome } from "@fundxi/core/application/basket_service";

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

/** Fresh idempotency token for one trade submission. Sent as the
 * ``Idempotency-Key`` header so a duplicate delivery of the SAME request
 * (proxy/network retry) dedupes server-side instead of double-trading.
 * Prefers the platform CSPRNG; falls back to a time+random token (collision
 * risk is negligible and keys are namespaced per portfolio server-side). */
function new_idempotency_key(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function idempotency_header(): Record<string, string> {
  return { "Idempotency-Key": new_idempotency_key() };
}

export const trades_api = {
  list(): Trade[] {
    return trades_repository.find_all();
  },
  /** Execute a buy/sell, refresh local caches. Throws on backend error. */
  async execute(input: ExecuteTradeInput): Promise<TradeOutcomeDTO> {
    const outcome = await api_post<TradeOutcomeDTO>("/api/trades", input, idempotency_header());
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
      await api_post<TradeOutcomeDTO>(
        "/api/trades",
        {
          player_id: pos.player_id,
          kind,
          shares,
          price: pos.price,
        },
        idempotency_header(),
      );
    });
    if (outcome.closed.length > 0) {
      await refresh_trades();
      await refresh_portfolio();
    }
    return outcome;
  },
  /** Buy a basket of players (a "buy the team" order) — each leg is a normal
   * buy placed sequentially. Refreshes the local caches once, after the batch.
   * Never throws on a per-leg failure: the ``BasketOutcome`` partitions the
   * legs into bought vs failed so the caller can show a partial result. */
  async execute_basket(buys: BasketBuy[]): Promise<BasketOutcome> {
    const outcome = await run_execute_basket(buys, async buy => {
      await api_post<TradeOutcomeDTO>(
        "/api/trades",
        { player_id: buy.player_id, kind: "buy", shares: buy.shares, price: buy.price },
        idempotency_header(),
      );
    });
    if (outcome.bought.length > 0) {
      await refresh_trades();
      await refresh_portfolio();
    }
    return outcome;
  },
};
