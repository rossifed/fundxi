"""BufferingPublisher — defer NATS publishes, then commit-then-publish.

DDD role: Adapter (driven) + ordering guard. Wraps the real
``NotificationPublisher``: ``publish`` only BUFFERS; ``flush`` commits
the session and THEN drains the buffer.

Why this exists — fidelity to live. The real ingest worker
(``live_pricing_poller``) processes a poll batch, ``commit``s, and only
then publishes. The replay must behave the same: buffer a game-minute's
notifications, commit that minute's writes, then publish. Before this,
the simulator published per event while committing per minute, so the
app was pinged about a minute it could not yet read — the GUI / Home /
Fixtures minute diverged. With commit-then-publish the app is never
notified of state it cannot see, so all surfaces stay in lockstep, and
the latency profile matches what live will actually look like.

Self-contained on purpose: it does NOT import the ingest service's
``commit_then_publish`` (no cross-service-boundary coupling). The ~6
lines of ordering logic are duplicated by design (Rule of Three: two
occurrences is acceptable).
"""

import asyncio
from dataclasses import dataclass, field

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.messaging import NotificationPublisher

log = structlog.get_logger(__name__)


@dataclass(slots=True)
class BufferingPublisher:
    inner: NotificationPublisher
    _buffer: list[tuple[str, bytes]] = field(default_factory=list)

    async def publish(self, subject: str, payload: bytes) -> None:
        """Defer: a publish is only durable-safe after the commit."""
        self._buffer.append((subject, payload))

    async def flush(self, session: AsyncSession) -> None:
        """Commit the pending writes, THEN publish what was buffered.

        Order is the whole point: subscribers are only ever notified of
        state already committed and readable. Publish failures are
        logged and swallowed — the DB is the source of truth and the
        browser self-heals on its next REST fetch.
        """
        notifications = self._buffer
        self._buffer = []
        await session.commit()
        if not notifications:
            return
        results = await asyncio.gather(
            *[self.inner.publish(subject, payload) for subject, payload in notifications],
            return_exceptions=True,
        )
        for (subject, _), result in zip(notifications, results, strict=True):
            if isinstance(result, BaseException):
                log.warning("simulation.publish_failed", subject=subject, error=str(result))
