"""Unit tests for BufferingPublisher (commit-then-publish ordering)."""

from dataclasses import dataclass, field

import pytest

from src.simulation.infrastructure.buffering_publisher import BufferingPublisher

pytestmark = pytest.mark.anyio


@dataclass(slots=True)
class _RecordingPublisher:
    fail_on: set[str] = field(default_factory=set)
    published: list[tuple[str, bytes]] = field(default_factory=list)

    async def publish(self, subject: str, payload: bytes) -> None:
        if subject in self.fail_on:
            raise RuntimeError(f"boom:{subject}")
        self.published.append((subject, payload))


@dataclass(slots=True)
class _FakeSession:
    events: list[str] = field(default_factory=list)

    async def commit(self) -> None:
        self.events.append("commit")


async def test_publish_only_buffers_until_flush() -> None:
    inner = _RecordingPublisher()
    session = _FakeSession()
    bp = BufferingPublisher(inner=inner)

    await bp.publish("fundxi.match_event.1", b"a")
    await bp.publish("fundxi.match_event.1", b"b")
    # Nothing published, nothing committed yet.
    assert inner.published == []
    assert session.events == []

    await bp.flush(session)  # type: ignore[arg-type]

    # Commit happened, THEN both notifications were published.
    assert session.events == ["commit"]
    assert inner.published == [("fundxi.match_event.1", b"a"), ("fundxi.match_event.1", b"b")]


async def test_flush_clears_buffer_between_minutes() -> None:
    inner = _RecordingPublisher()
    session = _FakeSession()
    bp = BufferingPublisher(inner=inner)

    await bp.publish("m1", b"x")
    await bp.flush(session)  # type: ignore[arg-type]
    await bp.publish("m2", b"y")
    await bp.flush(session)  # type: ignore[arg-type]

    assert inner.published == [("m1", b"x"), ("m2", b"y")]
    assert session.events == ["commit", "commit"]


async def test_empty_flush_commits_only() -> None:
    inner = _RecordingPublisher()
    session = _FakeSession()
    bp = BufferingPublisher(inner=inner)

    await bp.flush(session)  # type: ignore[arg-type]

    assert session.events == ["commit"]
    assert inner.published == []


async def test_publish_failure_is_swallowed_and_does_not_block_others() -> None:
    inner = _RecordingPublisher(fail_on={"bad"})
    session = _FakeSession()
    bp = BufferingPublisher(inner=inner)

    await bp.publish("good1", b"1")
    await bp.publish("bad", b"x")
    await bp.publish("good2", b"2")
    await bp.flush(session)  # type: ignore[arg-type]

    # Commit still happened; the two good ones still went out.
    assert session.events == ["commit"]
    assert ("good1", b"1") in inner.published
    assert ("good2", b"2") in inner.published
    assert ("bad", b"x") not in inner.published
