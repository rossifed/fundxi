import type { Player } from "@fundxi/core/domain/player/player";
import type { TradeKind } from "@fundxi/core/domain/portfolio/trade";
import {
  compute_buy_shortfall,
  compute_cash_after,
  compute_min_lot_cost,
  compute_quantity_from_pct,
  compute_quantity_from_shares,
  compute_realized_pnl,
  compute_shares_after,
  compute_short_quantity,
  compute_trade_share,
  MIN_LOT_SHARES,
} from "@fundxi/core/domain/portfolio/trade_calc";
import { portfolio_service } from "./portfolio_service";
import { valuation_service } from "./valuation_service";

export type TradeMode = "percentage" | "shares";

export interface TradePreviewInput {
  player: Player;
  kind: TradeKind;
  mode: TradeMode;
  percentage?: number; // 0-100, used when mode === "percentage"
  shares?: number; // used when mode === "shares"
  // Optional override for the reference price (€M). When omitted, the current
  // valuation is fetched via valuation_service. Used by surfaces that already
  // hold a price snapshot (e.g. MatchView passing a MatchPlayer's value).
  current_price?: number;
}

export interface TradePreview {
  player_id: number;
  kind: TradeKind;
  shares: number;
  amount: number; // €M
  percentage_of_portfolio: number;
  is_short: boolean;
  short_quantity: number;
  held_shares: number;

  shares_after: number;

  cash_before: number;
  cash_after: number;

  insufficient_capital: boolean;
  shortfall: number;

  realized_pnl: number;

  // Minimum-lot context — lets the UI explain why a small percentage buys
  // nothing for a very expensive player (e.g. 0.1 share of a €200M player is
  // €20M = 20% of a €100M book, so anything under 20% rounds to 0 shares).
  min_lot_shares: number; // the share quantum (smallest tradeable lot)
  min_lot_cost: number; // €M cost of that lot at the current price
  min_lot_pct: number; // that lot as a % of the portfolio
  below_min_lot: boolean; // sized to a positive budget but rounded to 0 shares
}

/** Pure orchestration: pulls the live state (portfolio, holding, price)
 * from the application services, then delegates every formula to the
 * ``trade_calc`` domain functions. Zero business logic in this file. */
export function simulate_trade(input: TradePreviewInput): TradePreview {
  const totals = portfolio_service.get_my_totals();
  const cash_before = portfolio_service.get_my_cash();
  const holding = portfolio_service.get_holding_for(input.player.id);
  const held_shares = holding?.shares ?? 0;
  const avg_buy = holding?.average_buy_price ?? 0;
  const current_price = input.current_price ?? valuation_service.get_current_price(input.player.id);

  const { shares, amount } =
    input.mode === "percentage"
      ? compute_quantity_from_pct(totals.total_value, input.percentage ?? 0, current_price)
      : compute_quantity_from_shares(input.shares ?? 0, current_price);

  const short_quantity = compute_short_quantity(input.kind, shares, held_shares);
  const { insufficient, shortfall } = compute_buy_shortfall(input.kind, amount, cash_before);

  const min_lot_cost = compute_min_lot_cost(current_price);
  // The user asked for a positive budget but it rounds to zero shares because
  // the smallest lot is larger than that budget (very expensive player).
  const requested_budget = input.mode === "percentage" ? (input.percentage ?? 0) > 0 : (input.shares ?? 0) > 0;
  const below_min_lot = shares === 0 && current_price > 0 && requested_budget;

  return {
    player_id: input.player.id,
    kind: input.kind,
    shares,
    amount,
    percentage_of_portfolio: compute_trade_share(amount, totals.total_value),
    is_short: short_quantity > 0,
    short_quantity,
    held_shares,
    shares_after: compute_shares_after(input.kind, held_shares, shares),
    cash_before,
    cash_after: compute_cash_after(input.kind, cash_before, amount),
    insufficient_capital: insufficient,
    shortfall,
    realized_pnl: compute_realized_pnl(input.kind, shares, current_price, avg_buy, held_shares),
    min_lot_shares: MIN_LOT_SHARES,
    min_lot_cost,
    min_lot_pct: compute_trade_share(min_lot_cost, totals.total_value),
    below_min_lot,
  };
}
