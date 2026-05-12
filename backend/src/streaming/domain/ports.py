"""Driven ports of the streaming bounded context.

DDD role: Protocol. The application layer (the hub) depends on this
abstraction; the concrete adapter (NATS) lives in
``streaming/infrastructure/``. Swapping NATS for Redis Streams /
Kafka later is a single-file change behind this port.
"""

from collections.abc import Awaitable, Callable
from types import TracebackType
from typing import Protocol, Self

# Called by the source for every received message: (subject, payload bytes).
MessageHandler = Callable[[str, bytes], Awaitable[None]]


class NotificationSource(Protocol):
    """A subscribable, fire-and-forget message source.

    Used as an async context manager: ``__aenter__`` connects and
    starts delivering, ``__aexit__`` drains and disconnects.
    """

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None: ...

    async def subscribe(self, subject: str, handler: MessageHandler) -> None:
        """Begin delivering messages matching ``subject`` to ``handler``."""
        ...
