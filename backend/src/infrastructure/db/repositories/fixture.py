"""SqlAlchemyFixtureRepository — Adapter for the FixtureRepository port.

DDD role: Adapter. Conflict target = `sportmonks_id`.
"""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.fixture import Fixture, FixtureStatus
from src.infrastructure.db.models.fixture import FixtureORM


def _to_domain(orm: FixtureORM) -> Fixture:
    return Fixture(
        id=orm.id,
        home_team_id=orm.home_team_id,
        away_team_id=orm.away_team_id,
        status=FixtureStatus(orm.status),
        group=orm.group,
        home_score=orm.home_score,
        away_score=orm.away_score,
        kickoff_at=orm.kickoff_at,
        minute=orm.minute,
        note=orm.note,
    )


class SqlAlchemyFixtureRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert_by_sportmonks_id(self, fixture: Fixture, *, sportmonks_id: int) -> None:
        stmt = pg_insert(FixtureORM).values(
            sportmonks_id=sportmonks_id,
            home_team_id=fixture.home_team_id,
            away_team_id=fixture.away_team_id,
            status=fixture.status.value,
            group=fixture.group,
            home_score=fixture.home_score,
            away_score=fixture.away_score,
            kickoff_at=fixture.kickoff_at,
            minute=fixture.minute,
            note=fixture.note,
        )
        update_payload = {
            "home_team_id": stmt.excluded.home_team_id,
            "away_team_id": stmt.excluded.away_team_id,
            "status": stmt.excluded.status,
            "group": stmt.excluded.group,
            "home_score": stmt.excluded.home_score,
            "away_score": stmt.excluded.away_score,
            "kickoff_at": stmt.excluded.kickoff_at,
            "minute": stmt.excluded.minute,
            "note": stmt.excluded.note,
        }
        stmt = stmt.on_conflict_do_update(index_elements=["sportmonks_id"], set_=update_payload)
        await self._session.execute(stmt)

    async def list_all(self) -> list[Fixture]:
        result = await self._session.execute(select(FixtureORM).order_by(FixtureORM.kickoff_at))
        return [_to_domain(row) for row in result.scalars().all()]

    async def get_by_id(self, fixture_id: int) -> Fixture | None:
        result = await self._session.execute(select(FixtureORM).where(FixtureORM.id == fixture_id))
        row = result.scalar_one_or_none()
        return _to_domain(row) if row else None

    async def list_by_status(self, status: FixtureStatus) -> list[Fixture]:
        result = await self._session.execute(
            select(FixtureORM).where(FixtureORM.status == status.value).order_by(FixtureORM.kickoff_at)
        )
        return [_to_domain(row) for row in result.scalars().all()]

    async def map_sportmonks_to_internal_id(self) -> dict[int, int]:
        result = await self._session.execute(
            select(FixtureORM.id, FixtureORM.sportmonks_id).where(FixtureORM.sportmonks_id.is_not(None))
        )
        return {smk: internal for internal, smk in result.all() if smk is not None}
