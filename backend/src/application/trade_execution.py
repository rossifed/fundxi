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


@dataclass(frozen=True, slots=True)
class TradeRequest:
    portfolio_id: int
    player_id: int
    kind: TradeKind
    shares: float
    price: float


@dataclass(frozen=True, slots=True)
class TradeOutcome:
    trade: Trade
    portfolio: Portfolio
    holding: Holding | None  # None if the position was fully closed


def _new_average(prev_shares: float, prev_avg: float, add_shares: float, add_price: float) -> float:
    """Weighted average for a buy add. Pure function."""
    if prev_shares + add_shares == 0:
        return 0.0
    return round((prev_shares * prev_avg + add_shares * add_price) / (prev_shares + add_shares), 2)


async def execute_trade(
    *,
    request: TradeRequest,
    portfolio: Portfolio,
    portfolio_repo: PortfolioRepository,
    trade_repo: TradeRepository,
) -> TradeOutcome:
    """Mutate cash + holding + insert trade in one transaction. The caller
    hydrates the Portfolio (cleaner DI for the web layer that already has
    user_id + portfolio fetched)."""
    if request.shares <= 0:
        raise TradeError("shares must be positive")
    if request.price <= 0:
        raise TradeError("price must be positive")
    if request.portfolio_id != portfolio.id:
        raise TradeError("portfolio mismatch")

    total = round(request.shares * request.price, 2)
    held = await portfolio_repo.get_holding(portfolio_id=request.portfolio_id, player_id=request.player_id)

    if request.kind is TradeKind.BUY:
        if portfolio.cash < total:
            raise TradeError(f"insufficient cash: need €{total:.2f}M, have €{portfolio.cash:.2f}M")
        new_shares = (held.shares if held else 0.0) + request.shares
        new_avg = _new_average(
            prev_shares=held.shares if held else 0.0,
            prev_avg=held.average_buy_price if held else 0.0,
            add_shares=request.shares,
            add_price=request.price,
        )
        new_holding = Holding(
            portfolio_id=request.portfolio_id,
            player_id=request.player_id,
            shares=new_shares,
            average_buy_price=new_avg,
        )
        await portfolio_repo.upsert_holding(new_holding)
        new_cash = round(portfolio.cash - total, 2)
    else:  # SELL
        if not held or held.shares < request.shares:
            owned = held.shares if held else 0.0
            raise TradeError(f"oversell: trying to sell {request.shares}, only own {owned}")
        new_shares = held.shares - request.shares
        if new_shares <= 1e-6:
            await portfolio_repo.delete_holding(portfolio_id=request.portfolio_id, player_id=request.player_id)
            new_holding = None
        else:
            new_holding = Holding(
                portfolio_id=request.portfolio_id,
                player_id=request.player_id,
                shares=new_shares,
                average_buy_price=held.average_buy_price,  # avg unchanged on sell
            )
            await portfolio_repo.upsert_holding(new_holding)
        new_cash = round(portfolio.cash + total, 2)

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
