"""StandingsPoller — singleton side poller for group-stage standings.

DDD role: Adapter (driven) implementing the ``Poller`` Protocol.
Unlike the per-fixture InplayPoller, this one always runs (no time
window) on its own configurable cadence. Each tick:

  1. ``GET /standings/seasons/{season_id}?include=details.type;participant;group``
  2. Archive the raw response (idempotent on response_hash).
  3. Project each group-stage row via ``project_standing`` and UPSERT.
  4. Commit, then publish a single ``fundxi.standings`` notification if
     anything was touched.
  5. Sleep ``poll_seconds``.

Errors are logged and swallowed; the next tick retries.
"""

import asyncio
import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.apply_qualifications import apply_qualifications
from src.infrastructure.db.repositories.raw_sportmonks_event import SqlAlchemyRawSportmonksEventRepository
from src.infrastructure.db.repositories.standings import SqlAlchemyStandingRepository
from src.infrastructure.sportmonks.client import SportmonksClient
from src.infrastructure.sportmonks.projectors.standing import project_standing
from src.ingest.application.commit_then_publish import commit_then_publish
from src.ingest.domain.ports import NotificationPublisher

log = structlog.get_logger(__name__)

_STANDINGS_INCLUDE = "details.type;participant;group"


@dataclass(slots=True)
class StandingsPoller:
    season_id: int
    poll_seconds: float
    client: SportmonksClient
    publisher: NotificationPublisher
    session_factory: Callable[[], AsyncSession]
    team_id_by_sportmonks: Mapping[int, str]

    async def run(self) -> None:
        log.info("ingest.standings.start", season_id=self.season_id, poll_seconds=self.poll_seconds)
        try:
            while True:
                await self.poll_once()
                await asyncio.sleep(self.poll_seconds)
        except asyncio.CancelledError:
            log.info("ingest.standings.stop", season_id=self.season_id)
            raise

    async def poll_once(self) -> None:
        endpoint = f"/standings/seasons/{self.season_id}"
        params = {"include": _STANDINGS_INCLUDE}
        try:
            envelope = await self.client.get(endpoint, params=params)
        except Exception as exc:
            log.warning("ingest.standings.fetch_failed", season_id=self.season_id, error=str(exc))
            return

        async with self.session_factory() as session:
            try:
                await self._persist(session=session, endpoint=endpoint, params=params, envelope=envelope)
            except Exception as exc:
                log.warning("ingest.standings.persist_failed", season_id=self.season_id, error=str(exc))
                await session.rollback()

    async def _persist(
        self,
        *,
        session: AsyncSession,
        endpoint: str,
        params: dict[str, Any],
        envelope: dict[str, Any],
    ) -> None:
        await SqlAlchemyRawSportmonksEventRepository(session).insert_if_new(
            endpoint=endpoint, params=params, response=envelope
        )

        rows = envelope.get("data")
        if not isinstance(rows, list):
            return

        repo = SqlAlchemyStandingRepository(session)
        upserted = 0
        for row in rows:
            if not isinstance(row, dict):
                continue
            standing = project_standing(row, team_id_by_sportmonks=dict(self.team_id_by_sportmonks))
            if standing is None:
                continue
            await repo.upsert(standing)
            upserted += 1

        notifications: list[tuple[str, bytes]] = []
        if upserted > 0:
            notifications.append(("fundxi.standings", json.dumps({"kind": "standings", "count": upserted}).encode()))
        # Group qualification (+5%): a team that has reached the knockout bracket
        # is rewarded once. Idempotent, so running it every tick is safe — it is
        # a no-op until knockout fixtures with real participants exist.
        qualification_notifs = await apply_qualifications(
            session, season_id=self.season_id, ts=datetime.now(UTC)
        )
        notifications.extend(qualification_notifs)
        await commit_then_publish(session=session, publisher=self.publisher, notifications=notifications)
        log.info(
            "ingest.standings.tick",
            season_id=self.season_id,
            upserted=upserted,
            qualifications=len(qualification_notifs),
        )
