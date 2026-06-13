import { portfolio_service, type HoldingDetail } from "@fundxi/core/application/portfolio_service";
import { simulate_trade, type TradePreview, type TradePreviewInput } from "@fundxi/core/application/trade_service";
import type { Trade } from "@fundxi/core/domain/portfolio/trade";
import { price_per_share, to_display_shares } from "@fundxi/core/domain/portfolio/trade_calc";
import { get_shares_per_player } from "@fundxi/core/infrastructure/runtime_config";
import type { HoldingMetrics, PortfolioTotals } from "@fundxi/core/domain/portfolio/portfolio_metrics";
import {
  fetch_portfolio_history,
  type HistoryRange,
  type PortfolioHistoryDTO,
} from "@fundxi/core/infrastructure/repositories/portfolio_history_repository";
import { refresh_portfolio, subscribe_portfolio } from "@fundxi/core/infrastructure/repositories/portfolio_repository";
import { trades_repository } from "@fundxi/core/infrastructure/repositories/trades_repository";

export const portfolio_api = {
  get_totals(): PortfolioTotals {
    return portfolio_service.get_my_totals();
  },
  get_holdings(): HoldingDetail[] {
    return portfolio_service.get_my_holdings_with_metrics();
  },
  /** Live metrics for ONE held player (market_value, pnl, return_pct, …) — the
   * single source the per-player "Your position" card uses on web AND mobile,
   * so the two clients are aligned by construction, not by copied arithmetic.
   * undefined when the player is not held. */
  get_holding_metrics(player_id: number): HoldingMetrics | undefined {
    return portfolio_service.get_holding_metrics(player_id);
  },
  get_cash(): number {
    return portfolio_service.get_my_cash();
  },
  preview_trade(input: TradePreviewInput): TradePreview {
    return simulate_trade(input);
  },
  list_trades(): Trade[] {
    return trades_repository.find_all();
  },
  /** When a position was first opened (earliest trade for the player), as raw
   * date + time so each UI formats it. ``null`` when the player was never traded. */
  opened_at(player_id: number): { date: string; time: string } | null {
    let earliest: Trade | null = null;
    for (const t of trades_repository.find_all()) {
      if (t.player_id !== player_id) continue;
      if (!earliest || t.date < earliest.date || (t.date === earliest.date && t.time < earliest.time)) earliest = t;
    }
    return earliest ? { date: earliest.date, time: earliest.time } : null;
  },
  /** Convert a canonical ownership fraction to the displayed share count
   * (fraction × shares-per-player). The single place the UI turns a stored
   * ``shares`` into the number it renders, so web and mobile never diverge. */
  to_display_shares(ownership_fraction: number): number {
    return to_display_shares(ownership_fraction, get_shares_per_player());
  },
  /** Convert a player's whole value (€M, mkt cap) to its per-share price
   * (€M/share = value / N). Used for trade-history rows that hold a raw price. */
  to_price_per_share(total_value: number): number {
    return price_per_share(total_value, get_shares_per_player());
  },
  /** Portfolio value history. Served by the backend BFF — all math
   * and storage are server-side (``valuation.portfolio_value_snapshot``
   * hypertable + ``PortfolioHistoryService``). The web client, the
   * future mobile client and any other surface consume the same DTO. */
  async fetch_history(range: HistoryRange = "24h"): Promise<PortfolioHistoryDTO> {
    return fetch_portfolio_history(range);
  },
  /** Async — re-fetch the portfolio (holdings + cash) from the BFF. */
  refresh(): Promise<void> {
    return refresh_portfolio();
  },
  /** Subscribe to in-place portfolio mutations (e.g. after a trade). Returns the unsubscribe fn. */
  subscribe(listener: () => void): () => void {
    return subscribe_portfolio(listener);
  },
};
