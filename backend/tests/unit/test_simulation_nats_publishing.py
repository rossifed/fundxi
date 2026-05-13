"""Unit tests for the simulation's NATS-publishing decorators."""

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime

import pytest

from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind
from src.simulation.infrastructure.nats_publishing_sink import NatsPublishingSink
from src.simulation.infrastructure.nats_publishing_tick_writer import NatsPublishingTickWriter


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


@dataclass(slots=True)
class _RecordingTickWriter:
    inserts: list[dict[str, object]] = field(default_factory=list)

    async def insert(
        self,
        *,
        player_id: int,
        ts: datetime,
        fixture_id: int | None,
        current_price: float,
        performance_rating: float,
        change_since_open: float,
    ) -> None:
        self.inserts.append(
            {
                "player_id": player_id,
                "ts": ts,
                "fixture_id": fixture_id,
                "current_price": current_price,
                "performance_rating": performance_rating,
                "change_since_open": change_since_open,
            }
        )


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


# --- NatsPublishingTickWriter ---------------------------------------------


@pytest.mark.anyio
async def test_tick_writer_forwards_then_publishes() -> None:
    inner = _RecordingTickWriter()
    pub = _RecordingPublisher()
    writer = NatsPublishingTickWriter(inner=inner, publisher=pub)
    ts = datetime(2022, 12, 18, 15, 30, 4, tzinfo=UTC)

    await writer.insert(
        player_id=777,
        ts=ts,
        fixture_id=65,
        current_price=15.5,
        performance_rating=7.75,
        change_since_open=5.0,
    )

    assert len(inner.inserts) == 1
    assert inner.inserts[0]["player_id"] == 777
    assert len(pub.log) == 1
    subject, payload = pub.log[0]
    assert subject == "fundxi.player_price_tick.777"
    assert json.loads(payload) == {
        "kind": "player_price_tick",
        "player_id": 777,
        "fixture_id": 65,
        "current_price": 15.5,
        "change_since_open": 5.0,
    }


@pytest.mark.anyio
async def test_tick_writer_publish_failure_does_not_break_insert() -> None:
    inner = _RecordingTickWriter()
    pub = _RecordingPublisher(fail=True)
    writer = NatsPublishingTickWriter(inner=inner, publisher=pub)
    ts = datetime(2022, 12, 18, 15, 0, 0, tzinfo=UTC)

    await writer.insert(
        player_id=1,
        ts=ts,
        fixture_id=65,
        current_price=10.0,
        performance_rating=6.5,
        change_since_open=0.0,
    )  # must not raise

    assert len(inner.inserts) == 1
    assert pub.log == []
