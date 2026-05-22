"""SqlAlchemyCoachRepository — Adapter for coach persistence.

DDD role: Adapter. Conflict target = ``sportmonks_id``. Mirrors
``SqlAlchemyVenueRepository``.
"""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.coach import CoachORM
from src.infrastructure.sportmonks.projectors.coach import CoachProjection


class SqlAlchemyCoachRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(self, projection: CoachProjection) -> int:
        """Upsert by sportmonks_id and return the internal id."""
        stmt = pg_insert(CoachORM).values(
            sportmonks_id=projection.sportmonks_id,
            name=projection.name,
            image_path=projection.image_path,
            nationality_name=projection.nationality_name,
            nationality_iso=projection.nationality_iso,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["sportmonks_id"],
            set_={
                "name": stmt.excluded.name,
                "image_path": stmt.excluded.image_path,
                "nationality_name": stmt.excluded.nationality_name,
                "nationality_iso": stmt.excluded.nationality_iso,
            },
        )
        await self._session.execute(stmt)
        row = await self._session.execute(
            select(CoachORM.id).where(CoachORM.sportmonks_id == projection.sportmonks_id)
        )
        return row.scalar_one()
