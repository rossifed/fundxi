"""NATS adapter for the ``NotificationSource`` port.

DDD role: Adapter (driven). Owns a single NATS client connection for
the streaming process. ``subscribe`` registers an async callback that
forwards ``(subject, data)`` to the hub's ``dispatch``. Use as an
async context manager: connect on entry, drain on exit.
"""

from dataclasses import dataclass, field
from types import TracebackType
from typing import Self

import structlog
from nats.aio.client import Client as NatsClient
from nats.aio.msg import Msg

from src.streaming.domain.ports import MessageHandler

log = structlog.get_logger(__name__)


@dataclass(slots=True)
class NatsNotificationSource:
    servers: tuple[str, ...] = ("nats://localhost:4222",)
    _client: NatsClient | None = field(default=None)

    async def __aenter__(self) -> Self:
        client = NatsClient()
        await client.connect(servers=list(self.servers), name="fundxi-streaming")
        self._client = client
        log.info("streaming.nats.connected", servers=list(self.servers))
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
            log.info("streaming.nats.disconnected")

    async def subscribe(self, subject: str, handler: MessageHandler) -> None:
        if self._client is None:
            raise RuntimeError("NatsNotificationSource is not connected — use `async with` first")

        async def _cb(msg: Msg) -> None:
            await handler(msg.subject, msg.data)

        await self._client.subscribe(subject, cb=_cb)
        log.info("streaming.nats.subscribed", subject=subject)
