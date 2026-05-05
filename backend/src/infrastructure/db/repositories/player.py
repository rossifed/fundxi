"""SqlAlchemyPlayerRepository — Adapter for the PlayerRepository port.

DDD role: Adapter. Conflict target = `sportmonks_id` (the only stable
identifier we get from the source).
"""

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.player.player import Player, Position
from src.domain.player.screener_criteria import ScreenerCriteria, SortDirection, SortKey
from src.infrastructure.db.models.player import PlayerORM


def _to_domain(orm: PlayerORM) -> Player:
    return Player(
        id=orm.id,
        name=orm.name,
        jersey_number=orm.jersey_number,
        team_id=orm.team_id,
        position=Position(orm.position),
        full_name=orm.full_name,
        age=orm.age,
        foot=orm.foot,
        height=orm.height,
        weight=orm.weight,
        club=orm.club,
        bio=orm.bio,
    )


class SqlAlchemyPlayerRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert_by_sportmonks_id(self, player: Player, *, sportmonks_id: int) -> None:
        stmt = pg_insert(PlayerORM).values(
            sportmonks_id=sportmonks_id,
            name=player.name,
            jersey_number=player.jersey_number,
            team_id=player.team_id,
            position=player.position.value,
            full_name=player.full_name,
            age=player.age,
            foot=player.foot,
            height=player.height,
            weight=player.weight,
            club=player.club,
            bio=player.bio,
        )
        update_payload = {
            "name": stmt.excluded.name,
            "jersey_number": stmt.excluded.jersey_number,
            "team_id": stmt.excluded.team_id,
            "position": stmt.excluded.position,
            "full_name": stmt.excluded.full_name,
            "age": stmt.excluded.age,
            "foot": stmt.excluded.foot,
            "height": stmt.excluded.height,
            "weight": stmt.excluded.weight,
            "club": stmt.excluded.club,
            "bio": stmt.excluded.bio,
        }
        stmt = stmt.on_conflict_do_update(index_elements=["sportmonks_id"], set_=update_payload)
        await self._session.execute(stmt)

    async def list_all(self) -> list[Player]:
        result = await self._session.execute(select(PlayerORM).order_by(PlayerORM.name).limit(2000))
        return [_to_domain(row) for row in result.scalars().all()]

    async def get_by_id(self, player_id: int) -> Player | None:
        result = await self._session.execute(select(PlayerORM).where(PlayerORM.id == player_id))
        row = result.scalar_one_or_none()
        return _to_domain(row) if row else None

    async def search(self, criteria: ScreenerCriteria) -> list[Player]:
        stmt = select(PlayerORM)
        if criteria.positions:
            stmt = stmt.where(PlayerORM.position.in_([p.value for p in criteria.positions]))
        if criteria.team_ids:
            stmt = stmt.where(PlayerORM.team_id.in_(list(criteria.team_ids)))
        if criteria.search:
            pattern = f"%{criteria.search}%"
            stmt = stmt.where(or_(PlayerORM.name.ilike(pattern), PlayerORM.full_name.ilike(pattern)))
        # min_value / max_value filter on synthetic valuation — applied in the
        # use-case layer post-fetch (no valuation column in core.player yet).
        if criteria.sort and criteria.sort.key is SortKey.AGE:
            order_col = PlayerORM.age
            descending = criteria.sort.direction is SortDirection.DESC
            stmt = stmt.order_by(order_col.desc() if descending else order_col.asc())
        else:
            stmt = stmt.order_by(PlayerORM.name)
        stmt = stmt.limit(criteria.limit)
        result = await self._session.execute(stmt)
        return [_to_domain(row) for row in result.scalars().all()]
