"""Trade margin rule — Domain Service (pure).

DDD role: Domain Service. Encodes the buying-power policy that bounds how large
a portfolio's total exposure may grow relative to its real equity, so a trade
can no longer mint buying power out of a short.

The rule, in one sentence: the gross exposure (the sum of the absolute market
value of every position) may not exceed equity times the leverage limit. Equity
is the honest net worth: cash plus the signed market value of all positions.
With ``max_leverage = 1.0`` the total size of all bets can never exceed the
portfolio's own money.

NOTE: the app is currently LONG-ONLY (shorting is rejected upstream in
``place_trade`` via ``would_open_short``), so with leverage 1.0 a buy is already
bounded by free cash and this gate cannot bind. The rule and its negative-share
handling are kept intact so re-enabling shorts (or leverage > 1) needs no change
here.

A trade that does NOT increase gross exposure (closing or reducing a position)
is always allowed, even when the portfolio is already over the limit: you must
always be able to de-risk. This is captured by raising the ceiling to whatever
the exposure already was before the trade.

Pure: no I/O. Callers supply the pre-trade positions, the signed share delta of
the trade, and the latest price for every involved player. The caller owns
pricing (and the cost-basis fallback for un-ticked players).
"""

from collections.abc import Mapping
from dataclasses import dataclass

# Positions whose absolute share count is below this are treated as closed, so a
# fully-covered leg does not leave a dust position skewing the exposure sum.
_SHARES_EPSILON = 1e-6
# Slack on the ceiling comparison to absorb float rounding (prices are already
# rounded to cents upstream, but the products accumulate).
_EXPOSURE_EPSILON = 1e-6


@dataclass(frozen=True, slots=True)
class MarginVerdict:
    """Outcome of the margin check. ``ok`` is the only gate; the numbers are
    carried for a human-readable rejection message."""

    ok: bool
    equity: float
    gross_exposure: float  # post-trade, the value being constrained
    limit: float  # equity * max_leverage — the normal ceiling


def evaluate_margin(
    *,
    positions_before: Mapping[int, float],
    traded_player_id: int,
    shares_delta: float,
    prices: Mapping[int, float],
    cash_after: float,
    max_leverage: float,
) -> MarginVerdict:
    """Decide whether a trade keeps the portfolio within its leverage limit.

    Args:
        positions_before: ``player_id -> shares`` for every open position BEFORE
            the trade (a short is negative). Closed positions are absent.
        traded_player_id: the player being bought/sold.
        shares_delta: signed share change of the trade — ``+shares`` for a BUY,
            ``-shares`` for a SELL.
        prices: ``player_id -> price`` for every involved player (all positions
            plus the traded one). The caller guarantees completeness, falling
            back to cost basis for un-ticked players.
        cash_after: the portfolio's cash once this trade settles.
        max_leverage: gross-exposure ceiling as a multiple of equity (1.0 = no
            leverage).

    Returns:
        A ``MarginVerdict``; ``ok`` is False when the trade would push gross
        exposure above the allowed ceiling.
    """
    positions_after = dict(positions_before)
    positions_after[traded_player_id] = positions_after.get(traded_player_id, 0.0) + shares_delta

    gross_before = _gross_exposure(positions_before, prices)
    gross_after = _gross_exposure(positions_after, prices)
    equity = cash_after + _signed_value(positions_after, prices)
    limit = equity * max_leverage

    # A reducing trade is always allowed: the ceiling can never be below where
    # the portfolio already sat, so de-risking is never blocked.
    ceiling = max(limit, gross_before)
    ok = gross_after <= ceiling + _EXPOSURE_EPSILON
    return MarginVerdict(ok=ok, equity=equity, gross_exposure=gross_after, limit=limit)


def _gross_exposure(positions: Mapping[int, float], prices: Mapping[int, float]) -> float:
    """Sum of the absolute market value of every open position."""
    return sum(abs(shares) * prices[pid] for pid, shares in positions.items() if abs(shares) > _SHARES_EPSILON)


def _signed_value(positions: Mapping[int, float], prices: Mapping[int, float]) -> float:
    """Net market value of all positions (shorts subtract)."""
    return sum(shares * prices[pid] for pid, shares in positions.items() if abs(shares) > _SHARES_EPSILON)
