"""Portfolio + Holding + Trade domain.

DDD roles:
- Portfolio: Aggregate Root (one per user) — owns Holdings.
- Holding: Entity within the Portfolio aggregate (identity = (portfolio_id, player_id)).
- Trade: Entity (append-only audit) — kind enum is a Value Object.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol


class TradeKind(StrEnum):
    BUY = "buy"
    SELL = "sell"


@dataclass(frozen=True, slots=True)
class Holding:
    portfolio_id: int
    player_id: int
    shares: float  # fractional shares supported (Robinhood-style)
    average_buy_price: float


@dataclass(frozen=True, slots=True)
class Trade:
    id: int
    portfolio_id: int
    player_id: int
    kind: TradeKind
    shares: float
    price: float
    total: float
    executed_at: datetime


@dataclass(frozen=True, slots=True)
class Portfolio:
    id: int
    user_id: int
    cash: float
    created_at: datetime
    updated_at: datetime


class PortfolioRepository(Protocol):
    async def get_by_user_id(self, user_id: int) -> Portfolio | None: ...

    async def create_for_user(self, *, user_id: int, cash: float) -> Portfolio: ...

    async def update_cash(self, *, portfolio_id: int, new_cash: float) -> None: ...

    async def list_holdings(self, portfolio_id: int) -> list[Holding]: ...

    async def get_holding(self, *, portfolio_id: int, player_id: int) -> Holding | None: ...

    async def upsert_holding(self, holding: Holding) -> None: ...

    async def delete_holding(self, *, portfolio_id: int, player_id: int) -> None: ...


class TradeRepository(Protocol):
    async def append(self, trade: Trade) -> Trade: ...

    async def list_by_portfolio(self, portfolio_id: int, *, limit: int = 200) -> list[Trade]: ...
