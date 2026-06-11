"""ReferenceRefresher — daily re-bootstrap of slow-changing reference data.

DDD role: Adapter (driving-side, but shaped as a ``Poller``). Once a
day (``INGEST_REFERENCE_REFRESH_SECONDS``, default 24h) it re-runs the
existing bootstrap Application Services for teams, fixtures and squads
so the live system picks up:

  - last-minute transfers / roster changes,
  - venue / kickoff-time updates,
  - and — crucially — the knockout-bracket fixtures, which Sportmonks
    only publishes once the group standings finalise.

After re-bootstrapping it reloads the ``SportmonksIdMaps`` and hands
them to a callback (the daemon wires this to the poller factory's
``set_id_maps``) so newly-created fixtures become spawnable without a
daemon restart, then publishes one ``fundxi.reference_refreshed``
notification.

This worker is a "fat adapter" in the same vein as StandingsPoller /
NewsPoller: it orchestrates application-layer use cases. The compromise
keeps all the side pollers structurally uniform.
"""

import asyncio
import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.bootstrap import bootstrap_fixtures, bootstrap_squads, bootstrap_teams
from src.infrastructure.db.repositories.coach import SqlAlchemyCoachRepository
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.player import SqlAlchemyPlayerRepository
from src.infrastructure.db.repositories.raw_sportmonks_event import SqlAlchemyRawSportmonksEventRepository
from src.infrastructure.db.repositories.team import SqlAlchemyTeamRepository
from src.infrastructure.sportmonks.client import SportmonksClient
from src.ingest.application.commit_then_publish import commit_then_publish
from src.ingest.domain.ports import NotificationPublisher
from src.ingest.infrastructure.sportmonks_id_maps import SportmonksIdMaps, load_sportmonks_id_maps

log = structlog.get_logger(__name__)


@dataclass(slots=True)
class ReferenceRefresher:
    season_id: int
    poll_seconds: float
    client: SportmonksClient
    publisher: NotificationPublisher
    session_factory: Callable[[], AsyncSession]
    on_id_maps_reloaded: Callable[[SportmonksIdMaps], None]

    async def run(self) -> None:
        log.info("ingest.reference.start", season_id=self.season_id, poll_seconds=self.poll_seconds)
        try:
            while True:
                await self.refresh_once()
                await asyncio.sleep(self.poll_seconds)
        except asyncio.CancelledError:
            log.info("ingest.reference.stop", season_id=self.season_id)
            raise

    async def refresh_once(self) -> None:
        try:
            async with self.session_factory() as session:
                new_maps = await self._rebootstrap(session)
        except Exception as exc:
            log.warning("ingest.reference.failed", season_id=self.season_id, error=str(exc))
            return
        # Reached only after a clean commit — propagate the fresh maps.
        self.on_id_maps_reloaded(new_maps)
        log.info("ingest.reference.done", season_id=self.season_id)

    async def _rebootstrap(self, session: AsyncSession) -> SportmonksIdMaps:
        raw_archive = SqlAlchemyRawSportmonksEventRepository(session)
        team_pairs = await bootstrap_teams(
            client=self.client,
            raw_archive=raw_archive,
            team_repo=SqlAlchemyTeamRepository(session),
            coach_repo=SqlAlchemyCoachRepository(session),
            season_id=self.season_id,
        )
        await bootstrap_fixtures(
            client=self.client,
            raw_archive=raw_archive,
            fixture_repo=SqlAlchemyFixtureRepository(session),
            teams=team_pairs,
            season_id=self.season_id,
        )
        await bootstrap_squads(
            client=self.client,
            raw_archive=raw_archive,
            player_repo=SqlAlchemyPlayerRepository(session),
            teams=team_pairs,
            season_id=self.season_id,
            today=datetime.now(UTC).date(),
        )
        # Reads see the session's pending writes (autoflush) — the maps
        # are consistent with what we are about to commit.
        new_maps = await load_sportmonks_id_maps(session)
        notification = json.dumps({"kind": "reference_refreshed", "teams": len(team_pairs)}).encode()
        await commit_then_publish(
            session=session,
            publisher=self.publisher,
            notifications=[("fundxi.reference_refreshed", notification)],
        )
        return new_maps
