"""SqlAlchemyFixtureRepository — Adapter for the FixtureRepository port.

DDD role: Adapter. Conflict target = `sportmonks_id`.
"""

from sqlalchemy import case, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from src.domain.match.fixture import Fixture, FixtureStatus
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.standings import StandingORM
from src.infrastructure.db.models.venue import VenueORM


def _to_domain(
    orm: FixtureORM,
    *,
    group_override: str | None = None,
    venue_name: str | None = None,
) -> Fixture:
    # Group letter (A..H) lives on ``core.standings``, populated by the
    # StandingsPoller. ``FixtureORM.group`` stays empty because Sportmonks'
    # /fixtures endpoint doesn't expose the group name. We resolve at read
    # time via a LEFT JOIN on the home team's standings row.
    return Fixture(
        id=orm.id,
        home_team_id=orm.home_team_id,
        away_team_id=orm.away_team_id,
        status=FixtureStatus(orm.status),
        group=group_override if group_override is not None else orm.group,
        home_score=orm.home_score,
        away_score=orm.away_score,
        kickoff_at=orm.kickoff_at,
        minute=orm.minute,
        note=orm.note,
        home_kit_color=orm.home_kit_color,
        away_kit_color=orm.away_kit_color,
        home_kit_palette=orm.home_kit_palette,
        away_kit_palette=orm.away_kit_palette,
        home_formation=orm.home_formation,
        away_formation=orm.away_formation,
        venue_name=venue_name,
        stage_name=orm.stage_name,
        round_name=orm.round_name,
        season_id=orm.season_id,
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
            season_id=fixture.season_id,
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
            "season_id": stmt.excluded.season_id,
            "home_score": stmt.excluded.home_score,
            "away_score": stmt.excluded.away_score,
            "kickoff_at": stmt.excluded.kickoff_at,
            "minute": stmt.excluded.minute,
            "note": stmt.excluded.note,
        }
        stmt = stmt.on_conflict_do_update(index_elements=["sportmonks_id"], set_=update_payload)
        await self._session.execute(stmt)

    async def list_all(self, *, season_id: int | None = None) -> list[Fixture]:
        query = self._select_enriched()
        if season_id is not None:
            query = query.where(FixtureORM.season_id == season_id)
        rows = await self._session.execute(query.order_by(FixtureORM.kickoff_at))
        return [_to_domain(fx, group_override=grp, venue_name=vn) for fx, grp, vn in rows.all()]

    async def get_by_id(self, fixture_id: int) -> Fixture | None:
        rows = await self._session.execute(self._select_enriched().where(FixtureORM.id == fixture_id))
        row = rows.one_or_none()
        if row is None:
            return None
        fx, grp, vn = row
        return _to_domain(fx, group_override=grp, venue_name=vn)

    async def list_by_status(self, status: FixtureStatus, *, season_id: int | None = None) -> list[Fixture]:
        query = self._select_enriched().where(FixtureORM.status == status.value)
        if season_id is not None:
            query = query.where(FixtureORM.season_id == season_id)
        rows = await self._session.execute(query.order_by(FixtureORM.kickoff_at))
        return [_to_domain(fx, group_override=grp, venue_name=vn) for fx, grp, vn in rows.all()]

    @staticmethod
    def _select_enriched():
        # Group letter is only meaningful when both teams sit in the same
        # group (i.e. a group-stage match). Knockout fixtures cross groups,
        # so we deliberately return NULL there — the UI shows them as KO.
        home_s = aliased(StandingORM)
        away_s = aliased(StandingORM)
        return (
            select(
                FixtureORM,
                case((home_s.group == away_s.group, home_s.group), else_=None).label("group_letter"),
                VenueORM.name.label("venue_name"),
            )
            .outerjoin(home_s, home_s.team_id == FixtureORM.home_team_id)
            .outerjoin(away_s, away_s.team_id == FixtureORM.away_team_id)
            .outerjoin(VenueORM, VenueORM.id == FixtureORM.venue_id)
        )

    async def map_sportmonks_to_internal_id(self) -> dict[int, int]:
        result = await self._session.execute(
            select(FixtureORM.id, FixtureORM.sportmonks_id).where(FixtureORM.sportmonks_id.is_not(None))
        )
        return {smk: internal for internal, smk in result.all() if smk is not None}

    async def set_kit_colors(
        self,
        *,
        sportmonks_id: int,
        home_kit_color: str | None,
        away_kit_color: str | None,
        home_kit_palette: str | None,
        away_kit_palette: str | None,
    ) -> None:
        """Update the four kit-color columns for the fixture identified by
        ``sportmonks_id``. No-op when the fixture row doesn't exist yet."""
        from sqlalchemy import update as sql_update

        await self._session.execute(
            sql_update(FixtureORM)
            .where(FixtureORM.sportmonks_id == sportmonks_id)
            .values(
                home_kit_color=home_kit_color,
                away_kit_color=away_kit_color,
                home_kit_palette=home_kit_palette,
                away_kit_palette=away_kit_palette,
            )
        )

    async def set_formations(
        self,
        *,
        sportmonks_id: int,
        home_formation: str | None,
        away_formation: str | None,
    ) -> None:
        """Update the tactical formation strings for the fixture. No-op when
        the fixture row doesn't exist yet."""
        from sqlalchemy import update as sql_update

        await self._session.execute(
            sql_update(FixtureORM)
            .where(FixtureORM.sportmonks_id == sportmonks_id)
            .values(home_formation=home_formation, away_formation=away_formation)
        )

    async def set_venue_and_phase(
        self,
        *,
        sportmonks_id: int,
        venue_id: int | None,
        stage_name: str | None,
        round_name: str | None,
    ) -> None:
        """Update venue link and tournament phase labels. No-op if the
        fixture row doesn't exist yet."""
        from sqlalchemy import update as sql_update

        await self._session.execute(
            sql_update(FixtureORM)
            .where(FixtureORM.sportmonks_id == sportmonks_id)
            .values(venue_id=venue_id, stage_name=stage_name, round_name=round_name)
        )

    async def set_phase(
        self,
        *,
        sportmonks_id: int,
        stage_name: str | None,
        round_name: str | None,
    ) -> None:
        """Update ONLY the tournament phase labels — venue_id left as-is.
        No-op if the fixture row doesn't exist yet."""
        from sqlalchemy import update as sql_update

        await self._session.execute(
            sql_update(FixtureORM)
            .where(FixtureORM.sportmonks_id == sportmonks_id)
            .values(stage_name=stage_name, round_name=round_name)
        )
