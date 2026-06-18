import type { Player } from "@fundxi/core/domain/player/player";
import type { TradeKind } from "@fundxi/core/domain/portfolio/trade";
import {
  buy_quantity_from_cash_pct,
  compute_buy_shortfall,
  compute_cash_after,
  compute_quantity_from_shares,
  compute_realized_pnl,
  compute_shares_after,
  compute_trade_share,
  pct_of_player,
  price_per_share,
  sell_quantity_from_position_pct,
  to_display_shares,
  trade_headroom_fraction,
} from "@fundxi/core/domain/portfolio/trade_calc";
import { get_shares_per_player } from "@fundxi/core/infrastructure/runtime_config";
import { portfolio_service } from "./portfolio_service";
import { valuation_service } from "./valuation_service";

export type TradeMode = "percentage" | "shares";

export interface TradePreviewInput {
  player: Player;
  kind: TradeKind;
  mode: TradeMode;
  percentage?: number; // 0-100, used when mode === "percentage"
  shares?: number; // displayed share count, used when mode === "shares"
  // Optional override for the reference price (€M, the player's WHOLE value).
  // When omitted, the current valuation is fetched via valuation_service. Used
  // by surfaces that already hold a price snapshot (e.g. MatchView).
  current_price?: number;
}

export interface TradePreview {
  player_id: number;
  kind: TradeKind;

  // Ownership fraction (1.0 = the whole player). The canonical quantity sent to
  // the backend and stored — NOT the displayed share count.
  shares: number;
  // Display denomination of the same trade for the UI.
  display_shares: number; // shares × N
  price_per_share: number; // €M per share = total_value / N
  amount: number; // €M, actual cost = shares × total_value

  percentage_of_portfolio: number; // % of the user's AUM this amount represents
  pct_of_player_after: number; // % of the player owned AFTER the trade (0..100, long-only)

  held_shares: number; // fraction held before the trade
  held_display_shares: number; // held_shares × N
  pct_of_player_held: number; // % of the player owned BEFORE the trade

  shares_after: number; // fraction held after the trade
  shares_after_display: number; // shares_after × N

  cash_before: number;
  cash_after: number;

  insufficient_capital: boolean;
  shortfall: number;

  realized_pnl: number;

  // The player-value cap (100%) trimmed the requested size — the UI tells the
  // user they hit "the whole player" and shows the max still tradeable.
  capped: boolean;
  max_trade_display_shares: number; // headroom toward 100%, in displayed shares

  // Sizing ceilings the UI binds its slider to (so a control can never request
  // more than is executable — owns this math here, not in the UI, web+mobile):
  max_trade_shares: number; // shares-mode ceiling = min(affordable, headroom), floored
  max_percentage: number; // percentage-mode ceiling: % of cash beyond which the cap binds (sell = 100)
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
  const total_value = input.current_price ?? valuation_service.get_current_price(input.player.id);
  const n = get_shares_per_player();

  const { shares, amount, capped } =
    input.mode === "percentage"
      ? input.kind === "buy"
        ? buy_quantity_from_cash_pct(cash_before, input.percentage ?? 0, total_value, n, held_shares)
        : sell_quantity_from_position_pct(held_shares, input.percentage ?? 0, total_value, n)
      : compute_quantity_from_shares(input.shares ?? 0, total_value, n, input.kind, held_shares);

  const { insufficient, shortfall } = compute_buy_shortfall(input.kind, amount, cash_before);
  const shares_after = compute_shares_after(input.kind, held_shares, shares);

  // Sizing ceilings (owned here, not in the UI). The headroom to the player cap,
  // in display shares; the affordable ceiling (cash for a buy); and the % of cash
  // beyond which a buy stops growing (the cap or cash binds). A sell sizes by % of
  // the held position, which can never exceed the cap → 100%.
  const pps = price_per_share(total_value, n);
  const safe_pps = pps > 0 ? pps : 1;
  const max_trade_display_shares = to_display_shares(trade_headroom_fraction(input.kind, held_shares), n);
  const affordable_display = input.kind === "buy" ? cash_before / safe_pps : Infinity;
  const max_trade_shares = Math.floor(Math.min(affordable_display, max_trade_display_shares));
  const max_buy_value = max_trade_display_shares * pps; // € headroom to the 100% cap
  const max_percentage =
    input.kind === "buy" && cash_before > 0
      ? Math.max(1, Math.min(100, Math.ceil((Math.min(cash_before, max_buy_value) / cash_before) * 100)))
      : 100;

  return {
    player_id: input.player.id,
    kind: input.kind,
    shares,
    display_shares: to_display_shares(shares, n),
    price_per_share: pps,
    amount,
    percentage_of_portfolio: compute_trade_share(amount, totals.total_value),
    pct_of_player_after: pct_of_player(shares_after),
    held_shares,
    held_display_shares: to_display_shares(held_shares, n),
    pct_of_player_held: pct_of_player(held_shares),
    shares_after,
    shares_after_display: to_display_shares(shares_after, n),
    cash_before,
    cash_after: compute_cash_after(input.kind, cash_before, amount),
    insufficient_capital: insufficient,
    shortfall,
    realized_pnl: compute_realized_pnl(input.kind, shares, total_value, avg_buy, held_shares),
    capped,
    max_trade_display_shares,
    max_trade_shares,
    max_percentage,
  };
}
