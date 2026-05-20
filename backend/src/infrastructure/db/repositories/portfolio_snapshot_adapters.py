"""Adapters for the snapshot-service ports.

DDD role: Adapters (driven). Concrete SQL implementations of the three
small ports used by ``PortfolioSnapshotService`` and
``PortfolioHistoryService``:

- ``SqlAlchemyDirtyPortfolioResolver``  — "who holds these players?"
- ``SqlAlchemyLatestPriceProvider``     — "latest tick per player"
- ``SqlAlchemyPortfolioReader``         — "cash for portfolio_id"

They live next to the snapshot repo because they are coordinated by
the same service and share the same session lifecycle.
"""

from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM
from src.infrastructure.db.models.portfolio import HoldingORM, PortfolioORM


@dataclass(frozen=True, slots=True)
class SqlAlchemyDirtyPortfolioResolver:
    session: AsyncSession

    async def find_holders_of(self, player_ids: Iterable[int]) -> list[int]:
        ids = list(player_ids)
        if not ids:
            return []
        result = await self.session.execute(
            select(distinct(HoldingORM.portfolio_id)).where(HoldingORM.player_id.in_(ids))
        )
        return [int(row) for row in result.scalars().all()]


@dataclass(frozen=True, slots=True)
class SqlAlchemyLatestPriceProvider:
    """Returns the most recent tick price per player.

    Uses a Postgres ``DISTINCT ON (player_id)`` over ``player_price_tick``
    ordered by ``ts DESC`` — cheap on the hypertable's
    ``(player_id, ts)`` PK. Missing players (no tick yet) are omitted
    from the result dict so callers can decide a fallback policy."""

    session: AsyncSession

    async def get_many(self, player_ids: Iterable[int]) -> dict[int, float]:
        ids = list(player_ids)
        if not ids:
            return {}
        stmt = (
            select(PlayerPriceTickORM.player_id, PlayerPriceTickORM.current_price)
            .where(PlayerPriceTickORM.player_id.in_(ids))
            .distinct(PlayerPriceTickORM.player_id)
            .order_by(PlayerPriceTickORM.player_id, PlayerPriceTickORM.ts.desc())
        )
        result = await self.session.execute(stmt)
        return {int(pid): float(price) for pid, price in result.all()}


@dataclass(frozen=True, slots=True)
class SqlAlchemyPortfolioReader:
    session: AsyncSession

    async def get_by_id(self, portfolio_id: int) -> tuple[int, float] | None:
        result = await self.session.execute(
            select(PortfolioORM.id, PortfolioORM.cash).where(PortfolioORM.id == portfolio_id)
        )
        row = result.first()
        if row is None:
            return None
        pid, cash = row
        return (int(pid), float(cash))
