"""SqlAlchemyTeamRepository — Adapter for the TeamRepository port.

DDD role: Adapter. Carries an AsyncSession (legitimate stateful class).
Conflict target = `id` (ISO country code, deterministic from country).
"""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.team.team import Confederation, Team, TeamKind
from src.infrastructure.db.models.team import TeamORM


def _to_domain(orm: TeamORM) -> Team:
    """Pure mapping ORM → domain entity."""
    return Team(
        id=orm.id,
        name=orm.name,
        flag=orm.flag,
        color=orm.color,
        kind=TeamKind(orm.kind),
        confederation=Confederation(orm.confederation) if orm.confederation else None,
        group=orm.group,
    )


class SqlAlchemyTeamRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(self, team: Team, *, sportmonks_id: int | None = None) -> None:
        stmt = pg_insert(TeamORM).values(
            id=team.id,
            sportmonks_id=sportmonks_id,
            name=team.name,
            flag=team.flag,
            color=team.color,
            kind=team.kind.value,
            confederation=team.confederation.value if team.confederation else None,
            group=team.group,
        )
        update_payload = {
            "sportmonks_id": stmt.excluded.sportmonks_id,
            "name": stmt.excluded.name,
            "flag": stmt.excluded.flag,
            "color": stmt.excluded.color,
            "kind": stmt.excluded.kind,
            "confederation": stmt.excluded.confederation,
            "group": stmt.excluded.group,
        }
        stmt = stmt.on_conflict_do_update(index_elements=["id"], set_=update_payload)
        await self._session.execute(stmt)

    async def list_all(self) -> list[Team]:
        result = await self._session.execute(select(TeamORM).order_by(TeamORM.name))
        return [_to_domain(row) for row in result.scalars().all()]

    async def get_by_id(self, team_id: str) -> Team | None:
        result = await self._session.execute(select(TeamORM).where(TeamORM.id == team_id))
        row = result.scalar_one_or_none()
        return _to_domain(row) if row else None
