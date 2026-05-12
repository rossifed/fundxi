"""Messaging ports — shared kernel across bounded contexts.

``NotificationPublisher`` is the fire-and-forget "publish bytes to a
subject" port used by any context that feeds the live-update bus:
``src/ingest`` (live data → bus) and ``src/simulation`` (replay → bus)
both publish through it; ``src/streaming`` consumes via its own
``NotificationSource`` port.

Callers must publish only after the originating DB transaction has
committed — otherwise a subscriber may invalidate its cache and
refetch a row that is not yet persisted.
"""

from typing import Protocol


class NotificationPublisher(Protocol):
    async def publish(self, subject: str, payload: bytes) -> None: ...
