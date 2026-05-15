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

from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.lineup import SqlAlchemyLineupRepository
from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.match_event import SqlAlchemyMatchEventRepository
from src.infrastructure.db.repositories.player_match_stat import SqlAlchemyPlayerMatchStatRepository
from src.infrastructure.db.repositories.team_match_stat import SqlAlchemyTeamMatchStatRepository
from src.infrastructure.db.repositories.raw_sportmonks_event import SqlAlchemyRawSportmonksEventRepository
from src.infrastructure.sportmonks.client import SportmonksClient, SportmonksError
from src.infrastructure.sportmonks.projectors.fixture import project_fixture
from src.infrastructure.sportmonks.projectors.lineup import project_lineup
from src.infrastructure.sportmonks.projectors.match_comment import project_match_comment
from src.infrastructure.sportmonks.projectors.match_event import project_match_event
from src.infrastructure.sportmonks.projectors.player_match_stat import project_player_match_stat
from src.infrastructure.sportmonks.projectors.team_match_stat import project_team_match_stats
from src.ingest.application.commit_then_publish import commit_then_publish
from src.ingest.domain.ports import NotificationPublisher
from src.ingest.infrastructure.sportmonks_id_maps import SportmonksIdMaps

log = structlog.get_logger(__name__)

# State + scores + participants come back by default with /fixtures/{id}
# in v3, but listing them explicitly makes the contract self-documenting
# and lets us add fields without ambiguity later.
_INPLAY_INCLUDE = (
    "state;participants;scores;events.type;comments;lineups.position;lineups.details;statistics.type"
)


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

        lineups_payload = _array(data.get("lineups"))
        fixture_updated = await self._project_fixture(session=session, fixture_payload=data)
        events_count = await self._project_events(
            session=session,
            events_payload=_array(data.get("events")),
        )
        comments_count = await self._project_comments(
            session=session,
            comments_payload=_array(data.get("comments")),
        )
        lineups_count = await self._project_lineups(session=session, lineups_payload=lineups_payload)
        player_stats_count = await self._project_player_match_stats(session=session, lineups_payload=lineups_payload)
        team_stats_count = await self._project_team_match_stats(
            session=session, stats_payload=_array(data.get("statistics"))
        )

        fix_id = self.fixture_internal_id
        notifications: list[tuple[str, bytes]] = []
        if fixture_updated:
            notifications.append(self._notif("fixture_status", {"fixture_id": fix_id}))
        if events_count > 0:
            notifications.append(self._notif("match_event", {"fixture_id": fix_id, "count": events_count}))
        if comments_count > 0:
            notifications.append(self._notif("match_comment", {"fixture_id": fix_id, "count": comments_count}))
        if lineups_count > 0:
            notifications.append(self._notif("lineup", {"fixture_id": fix_id, "count": lineups_count}))
        if player_stats_count > 0:
            notifications.append(self._notif("player_match_stat", {"fixture_id": fix_id, "count": player_stats_count}))
        if team_stats_count > 0:
            notifications.append(self._notif("team_match_stat", {"fixture_id": fix_id, "count": team_stats_count}))

        await commit_then_publish(session=session, publisher=self.publisher, notifications=notifications)

        log.info(
            "ingest.inplay.tick",
            fixture_internal_id=self.fixture_internal_id,
            fixture_updated=fixture_updated,
            events=events_count,
            comments=comments_count,
            lineups=lineups_count,
            player_stats=player_stats_count,
            team_stats=team_stats_count,
        )

    def _notif(self, kind: str, body: dict[str, Any]) -> tuple[str, bytes]:
        """Build a (subject, payload) tuple for ``commit_then_publish``."""
        return (
            f"fundxi.{kind}.{self.fixture_internal_id}",
            json.dumps({"kind": kind, **body}).encode(),
        )

    async def _project_fixture(self, *, session: AsyncSession, fixture_payload: dict[str, Any]) -> bool:
        """UPSERT the fixture itself (status, score, minute).

        Returns True if the row was touched, False if the payload was
        unprojectable (missing participants etc.) and was skipped."""
        group = self.id_maps.fixture_group_for(self.fixture_internal_id)
        if group is None:
            log.debug("ingest.inplay.fixture_skip", reason="no group in id_maps")
            return False
        try:
            fixture, smk_id = project_fixture(fixture_payload, group=group)
        except (ValueError, TypeError, KeyError) as exc:
            log.debug("ingest.inplay.fixture_skip", reason=str(exc))
            return False
        await SqlAlchemyFixtureRepository(session).upsert_by_sportmonks_id(fixture, sportmonks_id=smk_id)
        return True

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

    async def _project_lineups(self, *, session: AsyncSession, lineups_payload: list[dict[str, Any]]) -> int:
        repo = SqlAlchemyLineupRepository(session)
        upserted = 0
        for payload in lineups_payload:
            try:
                lineup, smk_id = project_lineup(
                    payload,
                    fixture_id=self.fixture_internal_id,
                    player_id_by_sportmonks=self.id_maps.player_id_by_sportmonks,
                    team_id_by_sportmonks=self.id_maps.team_id_by_sportmonks,
                )
            except (ValueError, TypeError) as exc:
                log.debug("ingest.inplay.lineup_skip", reason=str(exc))
                continue
            await repo.upsert_by_sportmonks_id(lineup, sportmonks_id=smk_id)
            upserted += 1
        return upserted

    async def _project_player_match_stats(
        self, *, session: AsyncSession, lineups_payload: list[dict[str, Any]]
    ) -> int:
        repo = SqlAlchemyPlayerMatchStatRepository(session)
        upserted = 0
        for payload in lineups_payload:
            result = project_player_match_stat(
                payload,
                fixture_id=self.fixture_internal_id,
                player_id_by_sportmonks=self.id_maps.player_id_by_sportmonks,
            )
            if result is None:
                continue
            stat, raw_details = result
            await repo.upsert(stat, raw_details=raw_details)
            upserted += 1
        return upserted

    async def _project_team_match_stats(
        self, *, session: AsyncSession, stats_payload: list[dict[str, Any]]
    ) -> int:
        if not stats_payload:
            return 0
        repo = SqlAlchemyTeamMatchStatRepository(session)
        rows: list[tuple[str, str, Any]] = []
        for projection in project_team_match_stats(stats_payload):
            internal_team_id = self.id_maps.team_id_by_sportmonks.get(projection.sportmonks_team_id)
            if internal_team_id is None:
                continue
            rows.append((internal_team_id, projection.type_code, projection.value))
        return await repo.upsert_batch(fixture_id=self.fixture_internal_id, rows=rows)


def _array(value: object) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]
