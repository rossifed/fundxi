"""SqlAlchemyStandingRepository — adapter for group-stage standings."""

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.standing import Standing
from src.infrastructure.db.models.standings import StandingORM


def _to_domain(orm: StandingORM) -> Standing:
    return Standing(
        team_id=orm.team_id,
        group=orm.group,
        position=orm.position,
        played=orm.played,
        won=orm.won,
        drawn=orm.drawn,
        lost=orm.lost,
        goals_for=orm.goals_for,
        goals_against=orm.goals_against,
        goal_difference=orm.goal_difference,
        points=orm.points,
    )


class SqlAlchemyStandingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(self, standing: Standing) -> None:
        stmt = pg_insert(StandingORM).values(
            team_id=standing.team_id,
            group=standing.group,
            position=standing.position,
            played=standing.played,
            won=standing.won,
            drawn=standing.drawn,
            lost=standing.lost,
            goals_for=standing.goals_for,
            goals_against=standing.goals_against,
            goal_difference=standing.goal_difference,
            points=standing.points,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="ux_standings_team",
            set_={
                "group": stmt.excluded.group,
                "position": stmt.excluded.position,
                "played": stmt.excluded.played,
                "won": stmt.excluded.won,
                "drawn": stmt.excluded.drawn,
                "lost": stmt.excluded.lost,
                "goals_for": stmt.excluded.goals_for,
                "goals_against": stmt.excluded.goals_against,
                "goal_difference": stmt.excluded.goal_difference,
                "points": stmt.excluded.points,
                "updated_at": text("now()"),
            },
        )
        await self._session.execute(stmt)

    async def list_all(self) -> list[Standing]:
        result = await self._session.execute(
            select(StandingORM).order_by(StandingORM.group, StandingORM.position)
        )
        return [_to_domain(o) for o in result.scalars().all()]

    async def list_by_group(self, group: str) -> list[Standing]:
        result = await self._session.execute(
            select(StandingORM).where(StandingORM.group == group).order_by(StandingORM.position)
        )
        return [_to_domain(o) for o in result.scalars().all()]

    async def get_for_team(self, team_id: str) -> Standing | None:
        result = await self._session.execute(select(StandingORM).where(StandingORM.team_id == team_id))
        row = result.scalar_one_or_none()
        return _to_domain(row) if row else None
