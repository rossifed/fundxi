"""SqlAlchemyFixturePredictionRepository — Adapter for FixturePredictionRepository.

DDD role: Adapter. Conflict target = ``fixture_id`` (one row per fixture).
"""

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.fixture_prediction import FixturePrediction
from src.infrastructure.db.models.fixture_prediction import FixturePredictionORM


class SqlAlchemyFixturePredictionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(self, prediction: FixturePrediction, *, source: str) -> None:
        stmt = pg_insert(FixturePredictionORM).values(
            fixture_id=prediction.fixture_id,
            p_home=prediction.p_home,
            p_draw=prediction.p_draw,
            p_away=prediction.p_away,
            source=source,
        )
        # Refresh on every pre-kickoff poll so the frozen value is the last one
        # observed before the match starts (captured_at bumped to now()).
        stmt = stmt.on_conflict_do_update(
            index_elements=["fixture_id"],
            set_={
                "p_home": stmt.excluded.p_home,
                "p_draw": stmt.excluded.p_draw,
                "p_away": stmt.excluded.p_away,
                "source": stmt.excluded.source,
                "captured_at": func.now(),
            },
        )
        await self._session.execute(stmt)

    async def get_by_fixture_id(self, fixture_id: int) -> FixturePrediction | None:
        row = (
            await self._session.execute(
                select(
                    FixturePredictionORM.p_home,
                    FixturePredictionORM.p_draw,
                    FixturePredictionORM.p_away,
                ).where(FixturePredictionORM.fixture_id == fixture_id)
            )
        ).one_or_none()
        if row is None:
            return None
        return FixturePrediction(
            fixture_id=fixture_id,
            p_home=float(row.p_home),
            p_draw=float(row.p_draw),
            p_away=float(row.p_away),
        )
