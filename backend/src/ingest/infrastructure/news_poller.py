"""NewsPoller — singleton side poller for Sportmonks pre/post-match news.

DDD role: Adapter (driven) implementing the ``Poller`` Protocol. Like
``StandingsPoller`` it always runs (no time window) on its own
configurable cadence. Each tick:

  1. For each of ``/news/pre-match/seasons/{season_id}`` and
     ``/news/post-match/seasons/{season_id}``:
       - archive the raw response (idempotent on response_hash);
       - project each item via the canonical ``project_news``;
       - resolve the optional Sportmonks fixture_id to our internal id
         (fresh lookup each tick — picks up newly-created knockout
         fixtures);
       - UPSERT into ``core.news``.
  2. Commit, then publish a single ``fundxi.news`` notification if any
     article was touched.

We use the structured Sportmonks News bundle (already paid for in the
WC2026 plan — the bootstrap already ingests it). External RSS feeds
were considered and deliberately deferred: Sportmonks news is
structured, fixture-tagged, archive-friendly and reuses the existing
projector / repo / BFF endpoints. If the editorial depth turns out
too thin we revisit then — not by default.

Only page 1 of each endpoint is fetched per tick (newest ~25 items).
Re-ingestion is idempotent (UPSERT on sportmonks_id), so a 15-minute
cadence comfortably catches new articles.
"""

import asyncio
import json
from collections.abc import Callable
from dataclasses import dataclass, replace
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.news import SqlAlchemyNewsRepository
from src.infrastructure.db.repositories.raw_sportmonks_event import SqlAlchemyRawSportmonksEventRepository
from src.infrastructure.sportmonks.client import SportmonksClient
from src.infrastructure.sportmonks.projectors.news import project_news
from src.ingest.application.commit_then_publish import commit_then_publish
from src.ingest.domain.ports import NotificationPublisher

log = structlog.get_logger(__name__)


@dataclass(slots=True)
class NewsPoller:
    season_id: int
    poll_seconds: float
    client: SportmonksClient
    publisher: NotificationPublisher
    session_factory: Callable[[], AsyncSession]

    async def run(self) -> None:
        log.info("ingest.news.start", season_id=self.season_id, poll_seconds=self.poll_seconds)
        try:
            while True:
                await self.poll_once()
                await asyncio.sleep(self.poll_seconds)
        except asyncio.CancelledError:
            log.info("ingest.news.stop", season_id=self.season_id)
            raise

    async def poll_once(self) -> None:
        endpoints = (
            f"/news/pre-match/seasons/{self.season_id}",
            f"/news/post-match/seasons/{self.season_id}",
        )
        envelopes: list[tuple[str, dict[str, Any]]] = []
        for endpoint in endpoints:
            try:
                envelopes.append((endpoint, await self.client.get(endpoint)))
            except Exception as exc:
                log.warning("ingest.news.fetch_failed", endpoint=endpoint, error=str(exc))

        if not envelopes:
            return

        async with self.session_factory() as session:
            try:
                upserted = await self._persist(session=session, envelopes=envelopes)
            except Exception as exc:
                log.warning("ingest.news.persist_failed", error=str(exc))
                await session.rollback()
                return

            notifications: list[tuple[str, bytes]] = []
            if upserted > 0:
                notifications.append(("fundxi.news", json.dumps({"kind": "news", "count": upserted}).encode()))
            await commit_then_publish(session=session, publisher=self.publisher, notifications=notifications)
            log.info("ingest.news.tick", season_id=self.season_id, upserted=upserted)

    async def _persist(self, *, session: AsyncSession, envelopes: list[tuple[str, dict[str, Any]]]) -> int:
        raw_repo = SqlAlchemyRawSportmonksEventRepository(session)
        news_repo = SqlAlchemyNewsRepository(session)
        fixture_id_by_smk = await SqlAlchemyFixtureRepository(session).map_sportmonks_to_internal_id()

        upserted = 0
        for endpoint, envelope in envelopes:
            await raw_repo.insert_if_new(endpoint=endpoint, params={}, response=envelope)
            for item in _array(envelope.get("data")):
                try:
                    news, sportmonks_id, smk_fixture_id = project_news(item)
                except (ValueError, TypeError) as exc:
                    log.debug("ingest.news.skip", reason=str(exc))
                    continue
                resolved = fixture_id_by_smk.get(smk_fixture_id) if smk_fixture_id is not None else None
                linked = replace(news, fixture_id=resolved)
                await news_repo.upsert_by_sportmonks_id(linked, sportmonks_id=sportmonks_id)
                upserted += 1
        return upserted


def _array(value: object) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]
