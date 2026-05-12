"""Driven ports of the ingest bounded context.

DDD role: Protocols. The application layer (supervisor, side pollers)
depends only on these; concrete implementations live in
``ingest/infrastructure/`` and are wired by the worker entry point.

The publish-side ``NotificationPublisher`` port lives in the shared
kernel (``src/domain/messaging.py``) — it is used by ``src/simulation``
too — and is re-exported here for the ingest layer's convenience.
"""

from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Protocol

from src.domain.messaging import NotificationPublisher

__all__ = ["Clock", "NotificationPublisher", "Poller", "PollerFactory", "SleepFn"]


class Clock(Protocol):
    """Wall-clock abstraction. Production wires the system clock; tests
    wire a controllable fake so the supervisor's window decisions are
    deterministic."""

    def now(self) -> datetime: ...


class Poller(Protocol):
    """Anything that, once awaited via ``run()``, loops until cancelled.

    Cancellation via ``asyncio.Task.cancel()`` is the canonical stop
    signal: implementations must respect ``asyncio.CancelledError``.
    """

    async def run(self) -> None: ...


class PollerFactory(Protocol):
    """Builds per-fixture pollers on demand.

    The supervisor calls ``create_inplay`` when a fixture enters its
    window and discards the returned poller (via task cancellation)
    when the window closes.
    """

    def create_inplay(self, fixture_internal_id: int) -> Poller: ...


# Sleep abstraction so the supervisor and pollers can be exercised
# without real-time delays in tests. Production wires ``asyncio.sleep``.
SleepFn = Callable[[float], Awaitable[None]]
