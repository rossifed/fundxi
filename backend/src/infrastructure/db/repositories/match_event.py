"""SqlAlchemyMatchEventRepository — Adapter for MatchEventRepository."""

from typing import Any, cast

from sqlalchemy import CursorResult, delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.match_event import MatchEvent, MatchEventType
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.match_event import MatchEventORM


def _to_domain(orm: MatchEventORM) -> MatchEvent:
    return MatchEvent(
        id=orm.id,
        fixture_id=orm.fixture_id,
        minute=orm.minute,
        extra_minute=orm.extra_minute,
        type=MatchEventType(orm.type),
        player_id=orm.player_id,
        related_player_id=orm.related_player_id,
        team_id=orm.team_id,
        info=orm.info,
        sequence=orm.sequence,
    )


class SqlAlchemyMatchEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert_by_sportmonks_id(self, event: MatchEvent, *, sportmonks_id: int) -> None:
        stmt = pg_insert(MatchEventORM).values(
            sportmonks_id=sportmonks_id,
            fixture_id=event.fixture_id,
            minute=event.minute,
            extra_minute=event.extra_minute,
            type=event.type.value,
            player_id=event.player_id,
            related_player_id=event.related_player_id,
            team_id=event.team_id,
            info=event.info,
            sequence=event.sequence,
        )
        update_payload = {
            "fixture_id": stmt.excluded.fixture_id,
            "minute": stmt.excluded.minute,
            "extra_minute": stmt.excluded.extra_minute,
            "type": stmt.excluded.type,
            "player_id": stmt.excluded.player_id,
            "related_player_id": stmt.excluded.related_player_id,
            "team_id": stmt.excluded.team_id,
            "info": stmt.excluded.info,
            "sequence": stmt.excluded.sequence,
        }
        stmt = stmt.on_conflict_do_update(index_elements=["sportmonks_id"], set_=update_payload)
        await self._session.execute(stmt)

    async def delete_goal(self, fixture_id: int, *, player_id: int, minute: int) -> int:
        """Remove a player's goal event at a given minute. Used to retract a
        goal annulled by VAR — Sportmonks drops the goal from its feed, but our
        upsert-only ingestion would otherwise keep the stale row. Idempotent
        (0 rows once already gone). Returns the number of events deleted."""
        result = cast(
            CursorResult[Any],
            await self._session.execute(
                delete(MatchEventORM)
                .where(MatchEventORM.fixture_id == fixture_id)
                .where(MatchEventORM.type == MatchEventType.GOAL.value)
                .where(MatchEventORM.player_id == player_id)
                .where(MatchEventORM.minute == minute)
            ),
        )
        return result.rowcount or 0

    async def list_by_fixture(self, fixture_id: int) -> list[MatchEvent]:
        result = await self._session.execute(
            # Chronological: `sequence` is Sportmonks `sort_order`, a per-type
            # counter (nth sub / nth card), NOT a global timeline. Order by the
            # minute, with sportmonks_id (monotonic) breaking same-minute ties.
            select(MatchEventORM)
            .where(MatchEventORM.fixture_id == fixture_id)
            .order_by(MatchEventORM.minute, MatchEventORM.extra_minute.nulls_first(), MatchEventORM.sportmonks_id)
        )
        return [_to_domain(row) for row in result.scalars().all()]

    async def list_chronological_by_season(self, season_id: int) -> list[MatchEvent]:
        # We don't have season_id on match_event; we join through fixture for
        # now. season filtering is ad-hoc until we lift season into core.
        result = await self._session.execute(
            select(MatchEventORM)
            .join(FixtureORM, MatchEventORM.fixture_id == FixtureORM.id)
            # Per-fixture chronological order — see list_by_fixture: `sequence`
            # (Sportmonks sort_order) is per-type, so order within a fixture by
            # the minute, sportmonks_id breaking same-minute ties.
            .order_by(
                FixtureORM.kickoff_at,
                MatchEventORM.minute,
                MatchEventORM.extra_minute.nulls_first(),
                MatchEventORM.sportmonks_id,
            )
        )
        return [_to_domain(row) for row in result.scalars().all()]

    async def list_since_id(self, last_id: int, *, limit: int = 1000) -> list[MatchEvent]:
        result = await self._session.execute(
            select(MatchEventORM).where(MatchEventORM.id > last_id).order_by(MatchEventORM.id).limit(limit)
        )
        return [_to_domain(row) for row in result.scalars().all()]
