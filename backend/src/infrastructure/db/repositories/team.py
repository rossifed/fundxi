"""SqlAlchemyTeamRepository — Adapter for the TeamRepository port.

DDD role: Adapter. Carries an AsyncSession (legitimate stateful class).
Conflict target = `id` (ISO country code, deterministic from country).
"""

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.team.team import Team, TeamKind
from src.infrastructure.db.models.coach import CoachORM
from src.infrastructure.db.models.team import TeamORM


def _to_domain(orm: TeamORM, coach: CoachORM | None = None) -> Team:
    """Pure mapping ORM → domain entity. ``coach`` is the LEFT-JOINed
    core.coach row (None when the team has no coach linked yet)."""
    return Team(
        id=orm.id,
        name=orm.name,
        flag=orm.flag,
        color=orm.color,
        kind=TeamKind(orm.kind),
        continent=orm.continent,
        group=orm.group,
        coach_name=coach.name if coach is not None else None,
        coach_image_path=coach.image_path if coach is not None else None,
        coach_nationality=coach.nationality_name if coach is not None else None,
    )


class SqlAlchemyTeamRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(
        self, team: Team, *, sportmonks_id: int | None = None, coach_id: int | None = None
    ) -> str:
        # sportmonks_id is the team's stable identity; the internal id is the
        # provider short_code, which CAN change between syncs (e.g. Haiti
        # HTI→HAI). Keying the upsert on id alone then tries to INSERT a second
        # row for the same sportmonks_id and trips its unique constraint,
        # aborting the whole daily refresh. So if this sportmonks_id already
        # lives under a different id, update THAT row in place — keep its id so
        # existing FKs (fixtures, players, quotes) stay valid — instead of
        # creating a colliding new one.
        if sportmonks_id is not None:
            existing_id = await self._session.scalar(
                select(TeamORM.id).where(TeamORM.sportmonks_id == sportmonks_id)
            )
            if existing_id is not None and existing_id != team.id:
                await self._session.execute(
                    update(TeamORM)
                    .where(TeamORM.sportmonks_id == sportmonks_id)
                    .values(
                        name=team.name,
                        flag=team.flag,
                        color=team.color,
                        kind=team.kind.value,
                        continent=team.continent,
                        group=team.group,
                        coach_id=func.coalesce(coach_id, TeamORM.coach_id),
                    )
                )
                # Downstream (fixtures, squads) must reference the id that
                # actually exists — the kept one, not the new short_code.
                return existing_id

        stmt = pg_insert(TeamORM).values(
            id=team.id,
            sportmonks_id=sportmonks_id,
            name=team.name,
            flag=team.flag,
            color=team.color,
            kind=team.kind.value,
            continent=team.continent,
            group=team.group,
            coach_id=coach_id,
        )
        update_payload = {
            "sportmonks_id": stmt.excluded.sportmonks_id,
            "name": stmt.excluded.name,
            "flag": stmt.excluded.flag,
            "color": stmt.excluded.color,
            "kind": stmt.excluded.kind,
            "continent": stmt.excluded.continent,
            "group": stmt.excluded.group,
            # Keep a previously-linked coach if this run carries none.
            "coach_id": func.coalesce(stmt.excluded.coach_id, TeamORM.coach_id),
        }
        stmt = stmt.on_conflict_do_update(index_elements=["id"], set_=update_payload)
        await self._session.execute(stmt)
        return team.id

    async def list_all(self) -> list[Team]:
        result = await self._session.execute(
            select(TeamORM, CoachORM)
            .outerjoin(CoachORM, CoachORM.id == TeamORM.coach_id)
            .order_by(TeamORM.name)
        )
        return [_to_domain(team, coach) for team, coach in result.all()]

    async def get_by_id(self, team_id: str) -> Team | None:
        result = await self._session.execute(
            select(TeamORM, CoachORM)
            .outerjoin(CoachORM, CoachORM.id == TeamORM.coach_id)
            .where(TeamORM.id == team_id)
        )
        row = result.one_or_none()
        if row is None:
            return None
        team, coach = row
        return _to_domain(team, coach)
