import { portfolio_service, type HoldingDetail } from "@/application/portfolio_service";
import { simulate_trade, type TradePreview, type TradePreviewInput } from "@/application/trade_service";
import type { Holding } from "@/domain/portfolio/holding";
import type { Trade } from "@/domain/portfolio/trade";
import type { PortfolioTotals } from "@/domain/portfolio/portfolio_metrics";
import { trades_repository } from "@/infrastructure/repositories/trades_repository";

export const portfolio_api = {
  get_totals(): PortfolioTotals {
    return portfolio_service.get_my_totals();
  },
  get_holdings(): HoldingDetail[] {
    return portfolio_service.get_my_holdings_with_metrics();
  },
  get_holding(player_id: number): Holding | undefined {
    return portfolio_service.get_holding_for(player_id);
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
};
