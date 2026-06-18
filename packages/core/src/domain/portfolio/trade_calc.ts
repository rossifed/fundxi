/* trade_calc — pure trade-related calculations.
 *
 * DDD role: Domain Service. Deterministic, no I/O. Holds the formulas the
 * application's ``simulate_trade`` orchestration relies on, so each piece is
 * unit-testable in isolation and reusable anywhere (preview, execution,
 * server-side replay).
 *
 * Units & model:
 *   - A player has a single ``total_value`` (€M) — the price the valuation
 *     engine produces (BaseValue × multiplier). It is the player's WHOLE
 *     market value, not a per-share slice.
 *   - A position is an ``ownership_fraction`` of that value: 1.0 = the whole
 *     player, 0.5 = half, −0.3 = a 30%-of-value short. This fraction is the
 *     canonical quantity stored and traded (the ``shares`` field everywhere).
 *   - A player is conceptually divisible into N (``shares_per_player``) shares
 *     purely for DISPLAY: ``price_per_share = total_value / N`` and a position's
 *     share count = ``fraction × N``. N never enters the money math — drop or
 *     change it and persisted fractions stay valid.
 *   - ``amount`` is the trade's actual cost/proceeds = fraction × total_value,
 *     rounded to the cent (the SAME value the backend debits).
 *
 * Position cap: a single position can never exceed the player's whole value
 * (``ownership_fraction ≤ 1``). Long-only — a sell unwinds the held long down to
 * zero but never opens a short, so positions stay in ``[0, 1]``. Enforced here
 * for the preview and (authoritatively) by the backend on execution.
 */

import type { TradeKind } from "./trade";

/** A position may never exceed the player's whole value in either direction. */
export const MAX_OWNERSHIP_FRACTION = 1;

/** Round a €M money value to the cent — mirrors the backend's
 * ``round(value, 2)`` so the preview and the executed trade agree. */
function round_money(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Display price of one share = the player's whole value split into N shares. */
export function price_per_share(total_value: number, shares_per_player: number): number {
  return shares_per_player <= 0 ? 0 : total_value / shares_per_player;
}

/** Ownership fraction rendered as a share count (the number the UI shows). */
export function to_display_shares(ownership_fraction: number, shares_per_player: number): number {
  return ownership_fraction * shares_per_player;
}

/** Inverse of {@link to_display_shares}: a UI share count back to a fraction. */
export function fraction_from_display_shares(display_shares: number, shares_per_player: number): number {
  return shares_per_player <= 0 ? 0 : display_shares / shares_per_player;
}

/** Percentage of the player a position represents (1.0 → 100%). */
export function pct_of_player(ownership_fraction: number): number {
  return ownership_fraction * 100;
}

/** Headroom (in fraction) still tradeable in the requested direction.
 * Long-only: a buy fills toward +1 (the whole player); a sell can only unwind
 * the held long down to zero — never into a short. Mirrors the backend
 * ``would_open_short`` rule so both ends agree. */
export function trade_headroom_fraction(kind: TradeKind, held_fraction: number): number {
  const headroom = kind === "buy" ? MAX_OWNERSHIP_FRACTION - held_fraction : held_fraction;
  return Math.max(0, headroom);
}

/** Clamp a requested trade so the resulting position stays within ±1 of the
 * player's value. Pure: takes the held fraction + the requested (already
 * floored to the quantum) fraction, returns what can actually be traded. */
export function cap_trade_fraction(kind: TradeKind, held_fraction: number, requested_fraction: number): number {
  return Math.max(0, Math.min(requested_fraction, trade_headroom_fraction(kind, held_fraction)));
}

/** Smallest tradeable fraction = one displayed share. */
function quantum_fraction(shares_per_player: number): number {
  return shares_per_player <= 0 ? 0 : 1 / shares_per_player;
}

/** Floor a raw fraction down to the share quantum (whole displayed shares),
 * so a trade never costs more than the budget that sized it. */
function floor_to_quantum(raw_fraction: number, shares_per_player: number): number {
  if (shares_per_player <= 0) return 0;
  return Math.floor(raw_fraction * shares_per_player) / shares_per_player;
}

/** Size a BUY by a percentage of available CASH. ``pct`` of cash is the spend
 * budget; fraction = budget / player value, floored to the quantum and capped at
 * the remaining headroom to 100% of the player. 100% = deploy all cash (no
 * "insufficient cash" surprise). */
export function buy_quantity_from_cash_pct(
  cash: number,
  pct: number,
  total_value: number,
  shares_per_player: number,
  held_fraction: number,
): { amount: number; shares: number; capped: boolean } {
  const raw = total_value <= 0 ? 0 : ((cash * pct) / 100) / total_value;
  return _size(raw, total_value, shares_per_player, "buy", held_fraction);
}

/** Size a SELL by a percentage of the HELD position. 100% = close the whole
 * holding. Cash is irrelevant here — you receive proceeds, not spend. */
export function sell_quantity_from_position_pct(
  held_fraction: number,
  pct: number,
  total_value: number,
  shares_per_player: number,
): { amount: number; shares: number; capped: boolean } {
  const raw = (held_fraction * pct) / 100;
  return _size(raw, total_value, shares_per_player, "sell", held_fraction);
}

/** Compute (amount, shares) when the user sizes a trade by an explicit
 * (displayed) share count. The count is converted to a fraction, floored to the
 * quantum, then capped to ±1 of the player's value. */
export function compute_quantity_from_shares(
  display_shares: number,
  total_value: number,
  shares_per_player: number,
  kind: TradeKind,
  held_fraction: number,
): { amount: number; shares: number; capped: boolean } {
  const raw = fraction_from_display_shares(display_shares, shares_per_player);
  return _size(raw, total_value, shares_per_player, kind, held_fraction);
}

/** Shared sizing tail: floor the raw fraction to the quantum, cap to ±1, and
 * report whether the player-value cap bit (the request was trimmed). */
function _size(
  raw_fraction: number,
  total_value: number,
  shares_per_player: number,
  kind: TradeKind,
  held_fraction: number,
): { amount: number; shares: number; capped: boolean } {
  const floored = floor_to_quantum(raw_fraction, shares_per_player);
  const shares = cap_trade_fraction(kind, held_fraction, floored);
  return { amount: round_money(shares * total_value), shares, capped: floored > shares + quantum_fraction(shares_per_player) / 2 };
}

/** Percentage of the portfolio represented by the trade amount.
 * Returns 0 when the portfolio is empty. */
export function compute_trade_share(amount: number, portfolio_value: number): number {
  if (portfolio_value === 0) return 0;
  return Math.round((amount / portfolio_value) * 100);
}

/** Holding position after the trade is applied.
 * - Buy increases the share count; sell decreases (can go negative ⇒ short). */
export function compute_shares_after(
  kind: TradeKind,
  held_shares: number,
  trade_shares: number,
): number {
  return kind === "buy" ? held_shares + trade_shares : held_shares - trade_shares;
}

/** Cash balance after the trade.
 * - Buy reduces cash by ``amount``; sell increases it. */
export function compute_cash_after(kind: TradeKind, cash_before: number, amount: number): number {
  return kind === "buy" ? cash_before - amount : cash_before + amount;
}

/** Realized P&L locked in by the trade.
 * - Only meaningful on a SELL of held shares. Beyond the held quantity
 *   the user is opening a short and there's no realized P&L on that leg.
 * - Returns 0 when kind=buy, no holding, or selling 0 held shares. */
export function compute_realized_pnl(
  kind: TradeKind,
  trade_shares: number,
  current_price: number,
  avg_buy_price: number,
  held_shares: number,
): number {
  if (kind !== "sell" || held_shares <= 0) return 0;
  const closing_shares = Math.min(trade_shares, held_shares);
  return (current_price - avg_buy_price) * closing_shares;
}

/** Does this BUY exceed the available cash? Returns the shortfall (0 if not). */
export function compute_buy_shortfall(
  kind: TradeKind,
  amount: number,
  cash_before: number,
): { insufficient: boolean; shortfall: number } {
  if (kind !== "buy" || amount <= cash_before) return { insufficient: false, shortfall: 0 };
  return { insufficient: true, shortfall: amount - cash_before };
}
