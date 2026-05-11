"""SQLAlchemy adapter for the ``ReplayArchiveReader`` port.

DDD role: Adapter (driven). Reads the recorded Sportmonks response
for a fixture out of ``raw.sportmonks_event``, then projects it into
the provider-agnostic ``ReplayEvent`` shape consumed by the use case.

Slice 1 reads only the ``?include=comments`` row. Later slices add
the ``?include=events.type;lineups.position`` row for match events
and lineup-derived emissions, alongside in the same bundle.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.fixture_repository import FixtureRepository
from src.infrastructure.db.models.raw_sportmonks_event import RawSportmonksEventORM
from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind
from src.simulation.domain.replay_fixture_bundle import ReplayFixtureBundle
from src.simulation.domain.replay_timeline import sort_timeline


@dataclass(frozen=True, slots=True)
class SqlAlchemyReplayArchiveReader:
    session: AsyncSession
    fixtures: FixtureRepository

    async def load_fixture_timeline(self, fixture_sportmonks_id: int) -> ReplayFixtureBundle:
        internal_id = await self._resolve_internal_id(fixture_sportmonks_id)
        comments = await self._load_comments(fixture_sportmonks_id)
        timeline = sort_timeline(_project_comments_to_events(comments))
        return ReplayFixtureBundle(fixture_internal_id=internal_id, timeline=timeline)

    async def _resolve_internal_id(self, fixture_sportmonks_id: int) -> int:
        mapping = await self.fixtures.map_sportmonks_to_internal_id()
        internal_id = mapping.get(fixture_sportmonks_id)
        if internal_id is None:
            raise LookupError(
                f"fixture sportmonks_id={fixture_sportmonks_id} not present in core.fixture"
            )
        return internal_id

    async def _load_comments(self, fixture_sportmonks_id: int) -> list[dict[str, Any]]:
        endpoint = f"/fixtures/{fixture_sportmonks_id}"
        row = (
            await self.session.execute(
                select(RawSportmonksEventORM.response)
                .where(RawSportmonksEventORM.endpoint == endpoint)
                .where(RawSportmonksEventORM.params["include"].astext == "comments")
                .order_by(RawSportmonksEventORM.ingested_at.desc())
                .limit(1)
            )
        ).first()
        if row is None:
            raise LookupError(
                f"no raw archive for endpoint={endpoint} with include=comments"
            )
        envelope = cast(dict[str, Any], row.response)
        data = envelope.get("data")
        if not isinstance(data, dict):
            return []
        comments = data.get("comments")
        if not isinstance(comments, list):
            return []
        return [c for c in comments if isinstance(c, dict)]


def _project_comments_to_events(comments: Iterable[dict[str, Any]]) -> Iterable[ReplayEvent]:
    for c in comments:
        minute = c.get("minute")
        if not isinstance(minute, int):
            continue
        extra = c.get("extra_minute")
        sequence = c.get("order")
        yield ReplayEvent(
            kind=ReplayEventKind.MATCH_COMMENT,
            minute=minute,
            extra_minute=extra if isinstance(extra, int) else None,
            sequence=sequence if isinstance(sequence, int) else 0,
            payload=c,
        )
