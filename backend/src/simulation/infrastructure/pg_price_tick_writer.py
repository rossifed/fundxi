"""SQLAlchemy adapter for the ``PlayerPriceTickWriter`` port.

DDD role: Adapter (driven). Appends one row per call to
``valuation.player_price_tick`` with ``ON CONFLICT DO NOTHING`` so
two events sharing the same ``(player_id, ts)`` PK are tolerated —
the first wins, consistent with deterministic replay semantics.

``source`` is hardcoded to ``ValuationSource.ENGINE`` because every
tick emitted here is the output of the events-based v0 strategy.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.valuation.player_valuation import ValuationSource
from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM


@dataclass(frozen=True, slots=True)
class SqlAlchemyPlayerPriceTickWriter:
    session: AsyncSession

    async def insert(
        self,
        *,
        player_id: int,
        ts: datetime,
        fixture_id: int | None,
        current_price: float,
        performance_rating: float,
        change_since_open: float,
    ) -> None:
        stmt = pg_insert(PlayerPriceTickORM).values(
            player_id=player_id,
            ts=ts,
            fixture_id=fixture_id,
            current_price=current_price,
            performance_rating=performance_rating,
            change_since_open=change_since_open,
            source=ValuationSource.ENGINE.value,
        )
        await self.session.execute(stmt.on_conflict_do_nothing(index_elements=["player_id", "ts"]))
