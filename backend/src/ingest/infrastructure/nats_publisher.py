"""NATS adapter for the ``NotificationPublisher`` port.

DDD role: Adapter (driven). Wraps a single ``nats.aio.client.Client``
connection that the whole ingest process shares. Publishing on NATS
is fire-and-forget (no JetStream): a browser subscriber always has
the DB as a fallback, so durability is not required at this layer.

The adapter is a small façade so:
  - the rest of the ingest code depends only on the Protocol;
  - tests inject an in-process fake without spinning up NATS;
  - migrating to Redis / Kafka later means swapping this file alone.
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

    Connect lifecycle and subject formatting (``fundxi.<kind>.<id>``)
    are concerns of the surrounding wiring layer; this adapter only
    knows ``publish(subject, payload)``.
    """

    servers: tuple[str, ...] = ("nats://localhost:4222",)
    _client: NatsClient | None = None

    async def __aenter__(self) -> Self:
        client = NatsClient()
        await client.connect(servers=list(self.servers), name="fundxi-ingest")
        self._client = client
        log.info("ingest.nats.connected", servers=list(self.servers))
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
            log.info("ingest.nats.disconnected")

    async def publish(self, subject: str, payload: bytes) -> None:
        if self._client is None:
            raise RuntimeError("NatsPublisher is not connected — use `async with` first")
        await self._client.publish(subject, payload)
