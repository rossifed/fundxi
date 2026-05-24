import type { Holding } from "@fundxi/core/domain/portfolio/holding";
import { api_get } from "@fundxi/core/infrastructure/api_client";

interface HoldingDTO {
  player_id: number;
  shares: number;
  average_buy_price: number;
}

interface PortfolioDTO {
  id: number;
  user_id: number;
  cash: number;
  holdings: HoldingDTO[];
}

let _portfolio_id = 0;
let _cash = 0;
let _holdings: Holding[] = [];

type Listener = () => void;
const _listeners = new Set<Listener>();

function _populate(dto: PortfolioDTO): void {
  _portfolio_id = dto.id;
  _cash = dto.cash;
  _holdings = dto.holdings.map(h => ({
    player_id: h.player_id,
    shares: h.shares,
    average_buy_price: h.average_buy_price,
  }));
}

export async function init_portfolio_repository(): Promise<void> {
  const dto = await api_get<PortfolioDTO>("/api/portfolio");
  _populate(dto);
}

export async function refresh_portfolio(): Promise<void> {
  const dto = await api_get<PortfolioDTO>("/api/portfolio");
  _populate(dto);
  for (const l of _listeners) l();
}

/** Subscribe to in-place portfolio mutations (returns the unsubscribe fn). */
export function subscribe_portfolio(l: Listener): () => void {
  _listeners.add(l);
  return () => {
    _listeners.delete(l);
  };
}

export function _set_from_outcome(dto: PortfolioDTO): void {
  // Used by trade execution to update the cache without an extra round-trip.
  _populate(dto);
  for (const l of _listeners) l();
}

export const portfolio_repository = {
  find_my_holdings(): readonly Holding[] {
    return _holdings;
  },
  find_my_cash(): number {
    return _cash;
  },
  find_portfolio_id(): number {
    return _portfolio_id;
  },
};
