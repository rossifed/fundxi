"""Trade execution — Application Service.

DDD role: Application Service. Atomic operation: validate constraints,
mutate cash + holding + insert trade in one transaction.

Pure domain logic for the math (cost, weighted average) is free of I/O so
it's directly unit-testable.
"""

from dataclasses import dataclass
from datetime import UTC, datetime

from src.domain.portfolio.portfolio import (
    Holding,
    Portfolio,
    PortfolioRepository,
    Trade,
    TradeKind,
    TradeRepository,
)


class TradeError(Exception):
    """Raised when a trade can't be executed (insufficient cash, oversell, …)."""


# Float slack on the cash check (€M). A buy sized to spend ALL cash arrives as
# shares * price, whose product can land a fraction of a femto-euro above the
# cash due to IEEE-754 rounding; without slack a legitimate "deploy 100%" would
# be wrongly rejected. 1e-9 €M = €0.001 — far below the scale-6 (€1) storage
# grain, so it tolerates fp noise only, never a real over-spend.
_CASH_EPSILON_M = 1e-9


@dataclass(frozen=True, slots=True)
class TradeRequest:
    portfolio_id: int
    player_id: int
    kind: TradeKind
    shares: float
    price: float
    # Carried onto the persisted Trade so a retry with the same key can be
    # detected and replayed. ``None`` = legacy non-idempotent path.
    idempotency_key: str | None = None


@dataclass(frozen=True, slots=True)
class TradeOutcome:
    trade: Trade
    portfolio: Portfolio
    holding: Holding | None  # None if the position was fully closed


def _compute_new_avg(*, prev_shares: float, prev_avg: float, kind: TradeKind, qty: float, price: float) -> float:
    """Weighted "open price" of the position after the trade. Pure function.

    Convention: `average_buy_price` (Holding) carries the cost basis of the
    OPEN side regardless of direction.
      - long  (shares > 0): weighted average of buys
      - short (shares < 0): weighted average of opens (sell-to-open prices)

    Direction transitions:
      - extending an existing long via buy / extending an existing short via
        sell  → weighted average against the new fill
      - reducing a long via sell / reducing a short via buy   → avg unchanged
        for the remaining position (realized P&L is implicit in cash delta)
      - crossing zero (long → short via sell, short → long via buy) → avg
        resets to the current fill price; only the new opening leg matters
    """
    if kind is TradeKind.BUY:
        new_shares = prev_shares + qty
        if prev_shares >= 0:
            # opening or extending a long
            denom = prev_shares + qty
            if denom == 0:
                return 0.0
            return round((prev_shares * prev_avg + qty * price) / denom, 2)
        # prev_shares < 0 — we're covering a short
        if new_shares <= 0:
            # still short (or exactly flat) — avg unchanged
            return prev_avg
        # crossed to long — reset basis to the fill price
        return round(price, 2)

    # SELL
    new_shares = prev_shares - qty
    if prev_shares <= 0:
        # opening or extending a short — average open prices
        prev_open = abs(prev_shares)
        denom = prev_open + qty
        if denom == 0:
            return 0.0
        return round((prev_open * prev_avg + qty * price) / denom, 2)
    # prev_shares > 0 — we're reducing a long
    if new_shares >= 0:
        # still long (or exactly flat) — avg unchanged
        return prev_avg
    # crossed to short — reset basis to the fill price
    return round(price, 2)


async def execute_trade(
    *,
    request: TradeRequest,
    portfolio: Portfolio,
    portfolio_repo: PortfolioRepository,
    trade_repo: TradeRepository,
) -> TradeOutcome:
    """Mutate cash + holding + insert trade in one transaction. The caller
    hydrates the Portfolio (cleaner DI for the web layer that already has
    user_id + portfolio fetched).

    Long-only: shorting is gated upstream in ``place_trade`` (the authoritative
    command path) via ``would_open_short`` — a SELL may only reduce a holding to
    zero. The math below still handles negative shares so the pure helpers stay
    fully defined, but the live path never reaches a short.
    """
    if request.shares <= 0:
        raise TradeError("shares must be positive")
    if request.price <= 0:
        raise TradeError("price must be positive")
    if request.portfolio_id != portfolio.id:
        raise TradeError("portfolio mismatch")

    # Full precision — NEVER round money in the domain (round only at display).
    # `shares` (4 dp) * `price` (2 dp) lands on <= 6 dp; rounding `total` to cents
    # here is what made cash drift from the position's mark (a fresh buy at the
    # current price showed a sub-cent residual at the account level, surfaced as a
    # phantom -0.05% / +20% once divided into a return). cash and total columns
    # carry scale 6 so the charge equals the position value exactly.
    total = request.shares * request.price
    held = await portfolio_repo.get_holding(portfolio_id=request.portfolio_id, player_id=request.player_id)
    prev_shares = held.shares if held else 0.0
    prev_avg = held.average_buy_price if held else 0.0

    if request.kind is TradeKind.BUY:
        # Longs are cash-only by design: a buy must be fully funded by free cash,
        # never on margin. This is intentional and asymmetric with shorts — the
        # leverage headroom (``max_gross_leverage`` in the margin rule) bounds how
        # far a SHORT can grow gross exposure, but it never lets a long borrow
        # cash. So even with max_gross_leverage > 1 a buy beyond cash is rejected
        # here; relax this check (not the margin rule) if leveraged longs are ever
        # wanted. See domain/portfolio/margin.py and config.max_gross_leverage.
        if portfolio.cash < total - _CASH_EPSILON_M:
            raise TradeError(f"insufficient cash: need €{total:.2f}M, have €{portfolio.cash:.2f}M")
        new_shares = prev_shares + request.shares
        new_cash = portfolio.cash - total
    else:  # SELL — long-only: never below zero (shorting is rejected in place_trade)
        new_shares = prev_shares - request.shares
        new_cash = portfolio.cash + total

    new_avg = _compute_new_avg(
        prev_shares=prev_shares,
        prev_avg=prev_avg,
        kind=request.kind,
        qty=request.shares,
        price=request.price,
    )

    if abs(new_shares) <= 1e-6:
        # position fully closed
        await portfolio_repo.delete_holding(portfolio_id=request.portfolio_id, player_id=request.player_id)
        new_holding = None
    else:
        new_holding = Holding(
            portfolio_id=request.portfolio_id,
            player_id=request.player_id,
            shares=new_shares,
            average_buy_price=new_avg,
        )
        await portfolio_repo.upsert_holding(new_holding)

    await portfolio_repo.update_cash(portfolio_id=request.portfolio_id, new_cash=new_cash)

    trade_record = Trade(
        id=0,
        portfolio_id=request.portfolio_id,
        player_id=request.player_id,
        kind=request.kind,
        shares=request.shares,
        price=request.price,
        total=total,
        executed_at=datetime.now(UTC),
        idempotency_key=request.idempotency_key,
    )
    saved_trade = await trade_repo.append(trade_record)

    new_portfolio = Portfolio(
        id=portfolio.id,
        user_id=portfolio.user_id,
        cash=new_cash,
        created_at=portfolio.created_at,
        updated_at=datetime.now(UTC),
    )
    return TradeOutcome(trade=saved_trade, portfolio=new_portfolio, holding=new_holding)
