"""Enforce ``commit then publish`` ordering at call sites.

DDD role: Application helper. The ingest pipeline writes data through
SQLAlchemy and then signals subscribers via the pub/sub bus; if the
publish lands before the commit, a subscriber may invalidate its
cache and refetch a row that is not yet visible. Routing every
post-write notification through this helper makes the ordering
impossible to violate.

Publish failures are logged and swallowed (graceful degradation): the
DB is the source of truth, and clients reconcile on next REST fetch.
"""

import asyncio
from collections.abc import Sequence

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.ingest.domain.ports import NotificationPublisher

log = structlog.get_logger(__name__)


async def commit_then_publish(
    *,
    session: AsyncSession,
    publisher: NotificationPublisher,
    notifications: Sequence[tuple[str, bytes]],
) -> None:
    """Commit the session, then publish every notification in parallel.

    ``notifications`` is a sequence of ``(subject, payload)`` tuples. All
    publishes are issued concurrently via ``asyncio.gather`` — they are
    independent and a slow one must not delay the others.

    A publish failure is logged but never re-raised: the data is safely
    persisted, and any subscriber that missed the notification will
    self-heal on the next REST fetch (the browser always reloads state
    from the DB on page open / reconnect).
    """
    await session.commit()
    if not notifications:
        return
    results = await asyncio.gather(
        *[publisher.publish(subject, payload) for subject, payload in notifications],
        return_exceptions=True,
    )
    for (subject, _), result in zip(notifications, results, strict=True):
        if isinstance(result, BaseException):
            log.warning("ingest.publish_failed", subject=subject, error=str(result))
