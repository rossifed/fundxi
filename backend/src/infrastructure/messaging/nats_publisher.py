"""NATS adapter for the ``NotificationPublisher`` port.

DDD role: Adapter (driven). Wraps a single ``nats.aio.client.Client``
connection that the owning process shares. Publishing is
fire-and-forget (no JetStream): browser subscribers always have the
DB as a fallback, so durability is not required at this layer.

Small façade so callers depend only on the Protocol, tests inject an
in-process fake without spinning up NATS, and migrating to Redis /
Kafka later means swapping this file alone.
"""

from dataclasses import dataclass
from types import TracebackType
from typing import Self

import structlog
from nats.aio.client import Client as NatsClient

log = structlog.get_logger(__name__)


@dataclass(slots=True)
class NatsPublisher:
    """Lifecycle-aware publisher. Use as an async context manager.

    ``name`` identifies the connection in NATS monitoring (so ingest vs
    simulation are distinguishable). Subject formatting
    (``fundxi.<kind>.<id>``) is the caller's concern; this adapter only
    knows ``publish(subject, payload)``.
    """

    servers: tuple[str, ...] = ("nats://localhost:4222",)
    name: str = "fundxi"
    _client: NatsClient | None = None

    async def __aenter__(self) -> Self:
        client = NatsClient()
        await client.connect(servers=list(self.servers), name=self.name)
        self._client = client
        log.info("nats.publisher.connected", servers=list(self.servers), name=self.name)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if self._client is not None:
            await self._client.drain()
            self._client = None
            log.info("nats.publisher.disconnected", name=self.name)

    async def publish(self, subject: str, payload: bytes) -> None:
        if self._client is None:
            raise RuntimeError("NatsPublisher is not connected — use `async with` first")
        await self._client.publish(subject, payload)
