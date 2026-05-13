"""SQLAlchemy adapter for the ``ReplayArchiveReader`` port.

DDD role: Adapter (driven). Reads the recorded Sportmonks responses
for a fixture out of ``raw.sportmonks_event`` and projects each
payload into the provider-agnostic ``ReplayEvent`` shape consumed by
the use case.

Two raw rows are consulted per fixture:
  - ``?include=comments``                         → per-minute commentary
  - ``?include=events.type;lineups.position``     → structured events (goals,
                                                    cards, subs, ...)

Both streams are merged into a single sorted timeline so the use case
emits everything in canonical match order without caring about source.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from itertools import chain
from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.fixture_repository import FixtureRepository
from src.infrastructure.db.models.raw_sportmonks_event import RawSportmonksEventORM
from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind
from src.simulation.domain.replay_fixture_bundle import ReplayFixtureBundle
from src.simulation.domain.replay_timeline import sort_timeline

_COMMENTS_INCLUDE = "comments"
_EVENTS_INCLUDE = "events.type;lineups.position"


@dataclass(frozen=True, slots=True)
class SqlAlchemyReplayArchiveReader:
    session: AsyncSession
    fixtures: FixtureRepository

    async def load_fixture_timeline(self, fixture_sportmonks_id: int) -> ReplayFixtureBundle:
        internal_id = await self._resolve_internal_id(fixture_sportmonks_id)
        comments = await self._load_array(fixture_sportmonks_id, include=_COMMENTS_INCLUDE, key="comments")
        events = await self._load_array(fixture_sportmonks_id, include=_EVENTS_INCLUDE, key="events")
        timeline = sort_timeline(
            chain(
                _project_comments_to_replay_events(comments),
                _project_events_to_replay_events(events),
            )
        )
        return ReplayFixtureBundle(fixture_internal_id=internal_id, timeline=timeline)

    async def _resolve_internal_id(self, fixture_sportmonks_id: int) -> int:
        mapping = await self.fixtures.map_sportmonks_to_internal_id()
        internal_id = mapping.get(fixture_sportmonks_id)
        if internal_id is None:
            raise LookupError(f"fixture sportmonks_id={fixture_sportmonks_id} not present in core.fixture")
        return internal_id

    async def _load_array(self, fixture_sportmonks_id: int, *, include: str, key: str) -> list[dict[str, Any]]:
        """Return ``response.data[key]`` from the archived row matching ``include``.

        Returns ``[]`` when the row exists but the array is empty or
        absent. Raises ``LookupError`` when no archived row matches.
        """
        endpoint = f"/fixtures/{fixture_sportmonks_id}"
        row = (
            await self.session.execute(
                select(RawSportmonksEventORM.response)
                .where(RawSportmonksEventORM.endpoint == endpoint)
                .where(RawSportmonksEventORM.params["include"].astext == include)
                .order_by(RawSportmonksEventORM.ingested_at.desc())
                .limit(1)
            )
        ).first()
        if row is None:
            raise LookupError(f"no raw archive for endpoint={endpoint} with include={include!r}")
        envelope = cast(dict[str, Any], row.response)
        data = envelope.get("data")
        if not isinstance(data, dict):
            return []
        items = data.get(key)
        if not isinstance(items, list):
            return []
        return [item for item in items if isinstance(item, dict)]


def _project_comments_to_replay_events(comments: Iterable[dict[str, Any]]) -> Iterable[ReplayEvent]:
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


def _project_events_to_replay_events(events: Iterable[dict[str, Any]]) -> Iterable[ReplayEvent]:
    """Sportmonks events use ``sort_order`` as their tie-breaker (vs ``order``
    for comments). Otherwise the mapping is identical."""
    for e in events:
        minute = e.get("minute")
        if not isinstance(minute, int):
            continue
        extra = e.get("extra_minute")
        sequence = e.get("sort_order")
        yield ReplayEvent(
            kind=ReplayEventKind.MATCH_EVENT,
            minute=minute,
            extra_minute=extra if isinstance(extra, int) else None,
            sequence=sequence if isinstance(sequence, int) else 0,
            payload=e,
        )
