/* Runtime presentation config — values set once at app boot.
 *
 * DDD role: infrastructure config holder. Mirrors the `set_api_base` pattern
 * (api_client.ts): each app (web, mobile) reads its platform env at boot and
 * pushes the value in, so `core` never touches `import.meta.env` /
 * `process.env` directly.
 *
 * `shares_per_player` is a pure DISPLAY denomination: a player is conceptually
 * divisible into N shares, so `price_per_share = total_value / N` and a
 * position's share count = ownership_fraction × N. It carries NO economic
 * weight — the canonical quantity everywhere (storage, trade math, P&L) is the
 * ownership fraction (1.0 = the whole player = its total value). Changing N
 * only restyles how that fraction is shown; persisted data stays valid.
 */

const DEFAULT_SHARES_PER_PLAYER = 1_000_000;
// Gross-exposure ceiling as a multiple of equity (AUM). Mirrors the backend
// `max_gross_leverage` setting — must match it so the frontend's "buying power"
// and margin-aware previews agree with what the server will actually accept.
const DEFAULT_MAX_GROSS_LEVERAGE = 1.0;

let _shares_per_player = DEFAULT_SHARES_PER_PLAYER;
let _max_gross_leverage = DEFAULT_MAX_GROSS_LEVERAGE;

/** Override the shares-per-player denomination (call once at app boot from the
 * platform env). Ignores non-finite or non-positive values, keeping the
 * default rather than poisoning every price/share computation. */
export function set_shares_per_player(n: number): void {
  if (Number.isFinite(n) && n > 0) _shares_per_player = n;
}

export function get_shares_per_player(): number {
  return _shares_per_player;
}

/** Override the gross-exposure leverage ceiling (call once at boot from env).
 * Must match the backend `max_gross_leverage`. Ignores non-finite/non-positive. */
export function set_max_gross_leverage(x: number): void {
  if (Number.isFinite(x) && x > 0) _max_gross_leverage = x;
}

export function get_max_gross_leverage(): number {
  return _max_gross_leverage;
}
