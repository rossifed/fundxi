"""SqlAlchemyLineupRepository — Adapter for LineupRepository."""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.lineup import Lineup, LineupRole
from src.infrastructure.db.models.lineup import LineupORM


def _to_domain(orm: LineupORM) -> Lineup:
    return Lineup(
        id=orm.id,
        fixture_id=orm.fixture_id,
        player_id=orm.player_id,
        team_id=orm.team_id,
        role=LineupRole(orm.role),
        position=orm.position,
        jersey_number=orm.jersey_number,
        formation_position=orm.formation_position,
    )


class SqlAlchemyLineupRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert_by_sportmonks_id(self, lineup: Lineup, *, sportmonks_id: int) -> None:
        stmt = pg_insert(LineupORM).values(
            sportmonks_id=sportmonks_id,
            fixture_id=lineup.fixture_id,
            player_id=lineup.player_id,
            team_id=lineup.team_id,
            role=lineup.role.value,
            position=lineup.position,
            jersey_number=lineup.jersey_number,
            formation_position=lineup.formation_position,
        )
        update_payload = {
            "fixture_id": stmt.excluded.fixture_id,
            "player_id": stmt.excluded.player_id,
            "team_id": stmt.excluded.team_id,
            "role": stmt.excluded.role,
            "position": stmt.excluded.position,
            "jersey_number": stmt.excluded.jersey_number,
            "formation_position": stmt.excluded.formation_position,
        }
        stmt = stmt.on_conflict_do_update(index_elements=["sportmonks_id"], set_=update_payload)
        await self._session.execute(stmt)

    async def list_by_fixture(self, fixture_id: int) -> list[Lineup]:
        result = await self._session.execute(
            select(LineupORM)
            .where(LineupORM.fixture_id == fixture_id)
            .order_by(LineupORM.role, LineupORM.formation_position.nulls_last(), LineupORM.jersey_number)
        )
        return [_to_domain(row) for row in result.scalars().all()]
