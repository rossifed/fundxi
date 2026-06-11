"""Unit tests for the simulation's NATS-publishing decorators."""

import json
from dataclasses import dataclass, field

import pytest

from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind
from src.simulation.infrastructure.nats_publishing_sink import NatsPublishingSink


@dataclass(slots=True)
class _RecordingPublisher:
    log: list[tuple[str, bytes]] = field(default_factory=list)
    fail: bool = False

    async def publish(self, subject: str, payload: bytes) -> None:
        if self.fail:
            raise RuntimeError("simulated NATS failure")
        self.log.append((subject, payload))


@dataclass(slots=True)
class _RecordingSink:
    emitted: list[tuple[ReplayEventKind, int]] = field(default_factory=list)

    async def emit(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        self.emitted.append((event.kind, fixture_internal_id))


def _event(kind: ReplayEventKind, *, minute: int, extra: int | None = None) -> ReplayEvent:
    return ReplayEvent(kind=kind, minute=minute, extra_minute=extra, sequence=1, payload={})


# --- NatsPublishingSink ---------------------------------------------------


@pytest.mark.anyio
async def test_sink_forwards_then_publishes_per_kind() -> None:
    inner = _RecordingSink()
    pub = _RecordingPublisher()
    sink = NatsPublishingSink(inner=inner, publisher=pub)

    await sink.emit(_event(ReplayEventKind.MATCH_COMMENT, minute=12), fixture_internal_id=65)
    await sink.emit(_event(ReplayEventKind.MATCH_EVENT, minute=23, extra=2), fixture_internal_id=65)

    # forwarded to the inner sink
    assert inner.emitted == [(ReplayEventKind.MATCH_COMMENT, 65), (ReplayEventKind.MATCH_EVENT, 65)]
    # and published with the right subjects
    subjects = [s for s, _ in pub.log]
    assert subjects == ["fundxi.match_comment.65", "fundxi.match_event.65"]
    event_msg = json.loads(pub.log[1][1])
    assert event_msg == {"kind": "match_event", "fixture_id": 65, "minute": 23, "extra_minute": 2}


@pytest.mark.anyio
async def test_sink_publish_failure_does_not_break_emit() -> None:
    inner = _RecordingSink()
    pub = _RecordingPublisher(fail=True)
    sink = NatsPublishingSink(inner=inner, publisher=pub)

    await sink.emit(_event(ReplayEventKind.MATCH_EVENT, minute=10), fixture_internal_id=65)  # must not raise

    assert inner.emitted == [(ReplayEventKind.MATCH_EVENT, 65)]
    assert pub.log == []
