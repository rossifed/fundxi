"""Sink decorator that mirrors each emitted replay event onto the NATS bus.

DDD role: Adapter (driven). Wraps an inner ``LiveDataSink`` (the
projector + price-tick chain) and, after the inner sink has persisted
an event, publishes the same per-fixture notification the live ingest
emits — so a Streamlit replay drives the React app's SSE streams
exactly as a real match would.

Publishes one message per emitted event (replay events are per-minute,
volume is low):
  ReplayEventKind.MATCH_COMMENT → fundxi.match_comment.<fixture_id>
  ReplayEventKind.MATCH_EVENT   → fundxi.match_event.<fixture_id>

Price-tick notifications are handled separately by
``NatsPublishingTickWriter`` (they originate inside the price-tick
sink, not as ReplayEvents).

Ordering vs DB: this decorator hands the notification to a
``BufferingPublisher``, which only BUFFERS it. The surrounding
``_CliSink`` / ``_GuiSink`` flushes once per game-minute —
``session.commit()`` THEN drain the buffer — so a notification is
published only after its minute's writes are durably committed and
readable. Same commit-then-publish ordering as the live ingest worker.
Publish failures are swallowed (the DB is the truth; browsers self-heal
on the next REST fetch).
"""

import json
from dataclasses import dataclass

import structlog

from src.domain.messaging import NotificationPublisher
from src.simulation.domain.ports import LiveDataSink
from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind

log = structlog.get_logger(__name__)

_KIND_TO_SUBJECT_PREFIX: dict[ReplayEventKind, str] = {
    ReplayEventKind.MATCH_COMMENT: "fundxi.match_comment",
    ReplayEventKind.MATCH_EVENT: "fundxi.match_event",
}


@dataclass(slots=True)
class NatsPublishingSink:
    inner: LiveDataSink
    publisher: NotificationPublisher

    async def emit(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        await self.inner.emit(event, fixture_internal_id=fixture_internal_id)
        prefix = _KIND_TO_SUBJECT_PREFIX.get(event.kind)
        if prefix is None:
            return
        subject = f"{prefix}.{fixture_internal_id}"
        payload = json.dumps(
            {
                "kind": event.kind.value,
                "fixture_id": fixture_internal_id,
                "minute": event.minute,
                "extra_minute": event.extra_minute,
            }
        ).encode()
        try:
            await self.publisher.publish(subject, payload)
        except Exception as exc:
            log.warning("simulation.nats.publish_failed", subject=subject, error=str(exc))
