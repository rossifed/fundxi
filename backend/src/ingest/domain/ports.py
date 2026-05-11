"""Driven ports of the ingest bounded context.

DDD role: Protocols. The application layer (supervisor, side pollers)
depends only on these; concrete implementations live in
``ingest/infrastructure/`` and are wired by the worker entry point.
"""

from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Protocol


class NotificationPublisher(Protocol):
    """Fire-and-forget publish to the live pub/sub bus.

    Implementations target NATS in production; tests inject a fake.

    Callers MUST publish only after the originating DB transaction has
    committed — otherwise a subscriber may invalidate its cache and
    refetch a stale row that has not yet been persisted. The
    ``application.commit_then_publish`` helper enforces this order at
    call sites.
    """

    async def publish(self, subject: str, payload: bytes) -> None: ...


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
