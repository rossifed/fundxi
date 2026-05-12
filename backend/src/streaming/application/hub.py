"""NotifyHub — in-memory fan-out from one NATS subscription to many SSE clients.

DDD role: Application Service. Holds, per topic string, the set of
bounded queues feeding currently-connected SSE streams. ``dispatch``
is the message handler wired into the ``NotificationSource``; it maps
the NATS subject to topics (pure ``topics_for_subject``) and pushes
the payload onto every matching queue.

Backpressure: each queue is bounded (``maxsize``). When a slow client
overflows it, the oldest message is dropped to make room — the
browser will self-heal on its next REST fetch. The hub itself never
blocks, so one slow client cannot stall the others.
"""

import asyncio
import contextlib
from dataclasses import dataclass, field

import structlog

from src.streaming.domain.notification import topics_for_subject

log = structlog.get_logger(__name__)


@dataclass(slots=True)
class NotifyHub:
    maxsize: int
    _by_topic: dict[str, set[asyncio.Queue[bytes]]] = field(default_factory=dict)

    def subscribe(self, topic: str) -> asyncio.Queue[bytes]:
        queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=self.maxsize)
        self._by_topic.setdefault(topic, set()).add(queue)
        return queue

    def unsubscribe(self, topic: str, queue: asyncio.Queue[bytes]) -> None:
        subscribers = self._by_topic.get(topic)
        if subscribers is None:
            return
        subscribers.discard(queue)
        if not subscribers:
            del self._by_topic[topic]

    def subscriber_count(self, topic: str) -> int:
        return len(self._by_topic.get(topic, ()))

    def topic_count(self) -> int:
        return len(self._by_topic)

    async def dispatch(self, subject: str, payload: bytes) -> None:
        """``NotificationSource`` message handler. Fan ``payload`` out to
        every queue subscribed to a topic this ``subject`` maps to."""
        topics = topics_for_subject(subject)
        if not topics:
            return
        for topic in topics:
            for queue in tuple(self._by_topic.get(topic, ())):
                self._offer(queue, payload, topic=topic)

    def _offer(self, queue: asyncio.Queue[bytes], payload: bytes, *, topic: str) -> None:
        """Non-blocking put: if the queue is full, drop the oldest item to
        make room (a lagging client loses history, never blocks the hub)."""
        try:
            queue.put_nowait(payload)
        except asyncio.QueueFull:
            with contextlib.suppress(asyncio.QueueEmpty):
                queue.get_nowait()
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(payload)
            log.warning("streaming.hub.slow_subscriber", topic=topic)
