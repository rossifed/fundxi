"""SqlAlchemyVenueRepository — Adapter for venue persistence.

DDD role: Adapter. Conflict target = ``sportmonks_id``.
"""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.venue import VenueORM
from src.infrastructure.sportmonks.projectors.venue import VenueProjection


class SqlAlchemyVenueRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(self, projection: VenueProjection) -> int:
        """Upsert by sportmonks_id and return the internal id."""
        stmt = pg_insert(VenueORM).values(
            sportmonks_id=projection.sportmonks_id,
            name=projection.name,
            city=projection.city,
            capacity=projection.capacity,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["sportmonks_id"],
            set_={
                "name": stmt.excluded.name,
                "city": stmt.excluded.city,
                "capacity": stmt.excluded.capacity,
            },
        )
        await self._session.execute(stmt)
        row = await self._session.execute(
            select(VenueORM.id).where(VenueORM.sportmonks_id == projection.sportmonks_id)
        )
        return row.scalar_one()
