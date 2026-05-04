import type { Player } from "@/domain/player/player";
import type { TradeKind } from "@/domain/portfolio/trade";
import { portfolio_service } from "./portfolio_service";

export type TradeMode = "percentage" | "shares";

export interface TradePreviewInput {
  player: Player;
  kind: TradeKind;
  mode: TradeMode;
  percentage?: number; // 0-100, used when mode === "percentage"
  shares?: number; // used when mode === "shares"
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

  // Impact on the player position after the trade
  shares_after: number;

  // Cash impact
  cash_before: number;
  cash_after: number;

  // Capital validation (only meaningful for buys)
  insufficient_capital: boolean;
  shortfall: number; // amount the user is missing if insufficient

  // For sells: realized P&L vs the held average buy price
  realized_pnl: number;
}

export function simulate_trade(input: TradePreviewInput): TradePreview {
  const totals = portfolio_service.get_my_totals();
  const cash_before = portfolio_service.get_my_cash();
  const holding = portfolio_service.get_holding_for(input.player.id);
  const held_shares = holding?.shares ?? 0;
  const portfolio_value = totals.total_value;

  let shares: number;
  let amount: number;

  if (input.mode === "percentage") {
    const pct = input.percentage ?? 0;
    amount = Math.round((portfolio_value * pct) / 100);
    shares = Math.floor((amount / input.player.value) * 10) / 10;
  } else {
    shares = input.shares ?? 0;
    amount = Math.round(shares * input.player.value);
  }

  const percentage_of_portfolio = portfolio_value === 0 ? 0 : Math.round((amount / portfolio_value) * 100);
  const is_short = input.kind === "sell" && shares > held_shares;
  const short_quantity = is_short ? Math.round((shares - held_shares) * 10) / 10 : 0;

  // Position after the trade
  const shares_after = input.kind === "buy" ? held_shares + shares : held_shares - shares;

  // Cash after the trade
  const cash_after = input.kind === "buy" ? cash_before - amount : cash_before + amount;

  // Capital check (buys only — sells generate cash, no insufficiency)
  const insufficient_capital = input.kind === "buy" && amount > cash_before;
  const shortfall = insufficient_capital ? amount - cash_before : 0;

  // Realized P&L on sells (gain/loss vs avg buy price for the shares being sold)
  const avg_buy = holding?.average_buy_price ?? 0;
  const realized_pnl =
    input.kind === "sell" && holding ? (input.player.value - avg_buy) * Math.min(shares, held_shares) : 0;

  return {
    player_id: input.player.id,
    kind: input.kind,
    shares,
    amount,
    percentage_of_portfolio,
    is_short,
    short_quantity,
    held_shares,
    shares_after,
    cash_before,
    cash_after,
    insufficient_capital,
    shortfall,
    realized_pnl,
  };
}
