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
from datetime import datetime

from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM
from src.infrastructure.db.models.portfolio import HoldingORM, PortfolioORM
from src.infrastructure.valuation.db_or_synthetic_starting_price_provider import (
    DbOrSyntheticStartingPriceProvider,
)


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
class SqlAlchemyCurrentPriceProvider:
    """Current price per player for PORTFOLIO VALUATION: the latest tick, or the
    player's starting price (``base_value``) when it has never ticked.

    This is the SAME ``tick ?? base`` rule the frontend's ``EngineValuationProvider``
    uses for ``current_price``, so a portfolio's value (snapshot + history live
    tail) marks each position at the exact price the rest of the UI shows — the
    alignment is by construction, not coincidence. Distinct from
    ``SqlAlchemyLatestPriceProvider`` (raw "tick or absent"), which the trade
    path needs so a genuinely un-priceable player is rejected rather than marked
    at a starting price."""

    session: AsyncSession
    as_of: datetime

    async def get_many(self, player_ids: Iterable[int]) -> dict[int, float]:
        ids = list(player_ids)
        if not ids:
            return {}
        prices = await SqlAlchemyLatestPriceProvider(self.session).get_many(ids)
        missing = [pid for pid in ids if pid not in prices]
        if missing:
            starts = await DbOrSyntheticStartingPriceProvider(self.session, as_of=self.as_of).get_many(missing)
            for pid, start in starts.items():
                if start is not None:
                    prices[pid] = float(start)
        return prices


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
