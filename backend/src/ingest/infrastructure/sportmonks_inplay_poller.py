"""Real inplay poller targeting Sportmonks.

DDD role: Adapter (driven) implementing the ``Poller`` Protocol. One
instance per active fixture. Loop:

  1. Open a fresh AsyncSession (so connection lifetime stays short).
  2. ``GET /fixtures/{smk_id}?include=events.type;comments`` via the
     shared Sportmonks client.
  3. Archive the raw response (idempotent on response_hash).
  4. Project events and comments through the **same** functions the
     batch bootstrap uses — replay & live share the projection layer.
  5. Commit the DB transaction, then publish notifications on NATS in
     parallel via ``commit_then_publish``.
  6. Sleep ``poll_seconds``.

Errors (HTTP, DB, projection) are logged and swallowed: the next tick
retries. Cancellation propagates cleanly via ``asyncio.CancelledError``.
"""

import asyncio
import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.match_event import SqlAlchemyMatchEventRepository
from src.infrastructure.db.repositories.raw_sportmonks_event import SqlAlchemyRawSportmonksEventRepository
from src.infrastructure.sportmonks.client import SportmonksClient, SportmonksError
from src.infrastructure.sportmonks.projectors.match_comment import project_match_comment
from src.infrastructure.sportmonks.projectors.match_event import project_match_event
from src.ingest.application.commit_then_publish import commit_then_publish
from src.ingest.domain.ports import NotificationPublisher
from src.ingest.infrastructure.sportmonks_id_maps import SportmonksIdMaps

log = structlog.get_logger(__name__)

_INPLAY_INCLUDE = "events.type;comments"


@dataclass(slots=True)
class SportmonksInplayPoller:
    fixture_internal_id: int
    fixture_sportmonks_id: int
    poll_seconds: float
    client: SportmonksClient
    publisher: NotificationPublisher
    session_factory: Callable[[], AsyncSession]
    id_maps: SportmonksIdMaps

    async def run(self) -> None:
        log.info(
            "ingest.inplay.start",
            fixture_internal_id=self.fixture_internal_id,
            fixture_sportmonks_id=self.fixture_sportmonks_id,
            poll_seconds=self.poll_seconds,
        )
        try:
            while True:
                await self.poll_once()
                await asyncio.sleep(self.poll_seconds)
        except asyncio.CancelledError:
            log.info("ingest.inplay.stop", fixture_internal_id=self.fixture_internal_id)
            raise

    async def poll_once(self) -> None:
        endpoint = f"/fixtures/{self.fixture_sportmonks_id}"
        params = {"include": _INPLAY_INCLUDE}
        try:
            envelope = await self.client.get(endpoint, params=params)
        except (SportmonksError, Exception) as exc:
            log.warning(
                "ingest.inplay.fetch_failed",
                fixture_internal_id=self.fixture_internal_id,
                error=str(exc),
            )
            return

        async with self.session_factory() as session:
            try:
                await self._project_and_persist(session=session, endpoint=endpoint, params=params, envelope=envelope)
            except Exception as exc:
                log.warning(
                    "ingest.inplay.persist_failed",
                    fixture_internal_id=self.fixture_internal_id,
                    error=str(exc),
                )
                await session.rollback()

    async def _project_and_persist(
        self,
        *,
        session: AsyncSession,
        endpoint: str,
        params: dict[str, Any],
        envelope: dict[str, Any],
    ) -> None:
        raw_repo = SqlAlchemyRawSportmonksEventRepository(session)
        await raw_repo.insert_if_new(endpoint=endpoint, params=params, response=envelope)

        data = envelope.get("data")
        if not isinstance(data, dict):
            return

        events_count = await self._project_events(
            session=session,
            events_payload=_array(data.get("events")),
        )
        comments_count = await self._project_comments(
            session=session,
            comments_payload=_array(data.get("comments")),
        )

        notifications: list[tuple[str, bytes]] = []
        if events_count > 0:
            notifications.append(
                (
                    f"fundxi.match_event.{self.fixture_internal_id}",
                    json.dumps(
                        {
                            "kind": "match_event",
                            "fixture_id": self.fixture_internal_id,
                            "count": events_count,
                        }
                    ).encode(),
                )
            )
        if comments_count > 0:
            notifications.append(
                (
                    f"fundxi.match_comment.{self.fixture_internal_id}",
                    json.dumps(
                        {
                            "kind": "match_comment",
                            "fixture_id": self.fixture_internal_id,
                            "count": comments_count,
                        }
                    ).encode(),
                )
            )

        await commit_then_publish(session=session, publisher=self.publisher, notifications=notifications)

        log.info(
            "ingest.inplay.tick",
            fixture_internal_id=self.fixture_internal_id,
            events=events_count,
            comments=comments_count,
        )

    async def _project_events(self, *, session: AsyncSession, events_payload: list[dict[str, Any]]) -> int:
        repo = SqlAlchemyMatchEventRepository(session)
        upserted = 0
        for payload in events_payload:
            try:
                event, smk_id = project_match_event(
                    payload,
                    fixture_id=self.fixture_internal_id,
                    player_id_by_sportmonks=self.id_maps.player_id_by_sportmonks,
                    team_id_by_sportmonks=self.id_maps.team_id_by_sportmonks,
                )
            except (ValueError, TypeError) as exc:
                log.debug("ingest.inplay.event_skip", reason=str(exc))
                continue
            await repo.upsert_by_sportmonks_id(event, sportmonks_id=smk_id)
            upserted += 1
        return upserted

    async def _project_comments(self, *, session: AsyncSession, comments_payload: list[dict[str, Any]]) -> int:
        repo = SqlAlchemyMatchCommentRepository(session)
        upserted = 0
        for payload in comments_payload:
            try:
                comment, smk_id = project_match_comment(payload, fixture_id=self.fixture_internal_id)
            except (ValueError, TypeError) as exc:
                log.debug("ingest.inplay.comment_skip", reason=str(exc))
                continue
            await repo.upsert_by_sportmonks_id(comment, sportmonks_id=smk_id)
            upserted += 1
        return upserted


def _array(value: object) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]
