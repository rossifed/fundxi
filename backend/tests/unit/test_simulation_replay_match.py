"""Unit tests for the replay_match Application Service.

Strategy: feed fakes for the archive reader, the sink and the sleep
function. The use case is pure orchestration over its ports, so this
covers it without touching the DB or the clock.
"""

from dataclasses import dataclass, field

import pytest

from src.simulation.application.replay_match import replay_match
from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind
from src.simulation.domain.replay_fixture_bundle import ReplayFixtureBundle


def _event(minute: int, *, marker: str, extra: int | None = None, sequence: int = 0) -> ReplayEvent:
    return ReplayEvent(
        kind=ReplayEventKind.MATCH_COMMENT,
        minute=minute,
        extra_minute=extra,
        sequence=sequence,
        payload={"marker": marker},
    )


@dataclass(slots=True)
class _StubArchive:
    bundle: ReplayFixtureBundle

    async def load_fixture_timeline(self, fixture_sportmonks_id: int) -> ReplayFixtureBundle:
        _ = fixture_sportmonks_id
        return self.bundle


@dataclass(slots=True)
class _RecordingSink:
    emitted: list[tuple[int, str]] = field(default_factory=list)

    async def emit(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        _ = fixture_internal_id
        self.emitted.append((event.minute, str(event.payload["marker"])))


@dataclass(slots=True)
class _RecordingSleep:
    durations: list[float] = field(default_factory=list)

    async def __call__(self, seconds: float) -> None:
        self.durations.append(seconds)


@dataclass(slots=True)
class _StopAfterController:
    """Fake ReplayController: stop once ``emitted`` reaches a threshold.

    ``emitted`` is the sink's tally — passed in by reference so the
    controller sees real-time progress. Never pauses.
    """

    emitted: list[tuple[int, str]]
    stop_after: int

    def stop_requested(self) -> bool:
        return len(self.emitted) >= self.stop_after

    async def wait_while_paused(self) -> None:
        return None


@pytest.mark.anyio
async def test_controller_stop_aborts_the_replay_early() -> None:
    timeline = (_event(0, marker="a"), _event(5, marker="b"), _event(10, marker="c"))
    archive = _StubArchive(ReplayFixtureBundle(fixture_internal_id=3, timeline=timeline))
    sink = _RecordingSink()
    sleep = _RecordingSleep()
    controller = _StopAfterController(emitted=sink.emitted, stop_after=2)

    report = await replay_match(
        fixture_sportmonks_id=1,
        speed=60.0,
        from_minute=0,
        archive=archive,
        sink=sink,
        sleep=sleep,
        controller=controller,
    )

    assert [m for m, _ in sink.emitted] == [0, 5]
    assert report.aborted is True
    assert report.events_emitted == 2


@pytest.mark.anyio
async def test_emits_events_in_canonical_order() -> None:
    timeline = (
        _event(5, marker="a"),
        _event(12, marker="b"),
        _event(12, marker="c", sequence=2),
    )
    archive = _StubArchive(ReplayFixtureBundle(fixture_internal_id=7, timeline=timeline))
    sink = _RecordingSink()
    sleep = _RecordingSleep()

    report = await replay_match(
        fixture_sportmonks_id=1,
        speed=60.0,
        from_minute=0,
        archive=archive,
        sink=sink,
        sleep=sleep,
    )

    assert sink.emitted == [(5, "a"), (12, "b"), (12, "c")]
    assert report.events_emitted == 3
    assert report.fixture_internal_id == 7


@pytest.mark.anyio
async def test_sleeps_proportionally_to_minutes_crossed_including_silent_gaps() -> None:
    timeline = (_event(0, marker="kick"), _event(5, marker="goal"))
    archive = _StubArchive(ReplayFixtureBundle(fixture_internal_id=1, timeline=timeline))
    sink = _RecordingSink()
    sleep = _RecordingSleep()

    # speed=60 → 1 second per game minute.
    await replay_match(
        fixture_sportmonks_id=1,
        speed=60.0,
        from_minute=0,
        archive=archive,
        sink=sink,
        sleep=sleep,
    )

    # 0 → 1s gap (minute 0 from baseline -1), then 5 → 5s gap (minutes 1..5).
    assert sleep.durations == [1.0, 5.0]


@pytest.mark.anyio
async def test_from_minute_skips_earlier_events_and_anchors_the_gap() -> None:
    timeline = (_event(2, marker="early"), _event(30, marker="late"))
    archive = _StubArchive(ReplayFixtureBundle(fixture_internal_id=1, timeline=timeline))
    sink = _RecordingSink()
    sleep = _RecordingSleep()

    # speed=60 → 1s per minute. Start at minute 25 → first sleep covers minutes 25..30 → 6s.
    await replay_match(
        fixture_sportmonks_id=1,
        speed=60.0,
        from_minute=25,
        archive=archive,
        sink=sink,
        sleep=sleep,
    )

    assert [m for m, _ in sink.emitted] == [30]
    assert sleep.durations == [6.0]


@pytest.mark.anyio
async def test_empty_timeline_returns_zero_report_without_sleeping() -> None:
    archive = _StubArchive(ReplayFixtureBundle(fixture_internal_id=42, timeline=()))
    sink = _RecordingSink()
    sleep = _RecordingSleep()

    report = await replay_match(
        fixture_sportmonks_id=1,
        speed=60.0,
        from_minute=0,
        archive=archive,
        sink=sink,
        sleep=sleep,
    )

    assert report.events_emitted == 0
    assert report.fixture_internal_id == 42
    assert sink.emitted == []
    assert sleep.durations == []


@pytest.mark.anyio
async def test_invalid_speed_is_rejected() -> None:
    archive = _StubArchive(ReplayFixtureBundle(fixture_internal_id=1, timeline=()))

    with pytest.raises(ValueError, match="speed"):
        await replay_match(
            fixture_sportmonks_id=1,
            speed=0.0,
            from_minute=0,
            archive=archive,
            sink=_RecordingSink(),
            sleep=_RecordingSleep(),
        )


@pytest.mark.anyio
async def test_invalid_from_minute_is_rejected() -> None:
    archive = _StubArchive(ReplayFixtureBundle(fixture_internal_id=1, timeline=()))

    with pytest.raises(ValueError, match="from_minute"):
        await replay_match(
            fixture_sportmonks_id=1,
            speed=60.0,
            from_minute=-1,
            archive=archive,
            sink=_RecordingSink(),
            sleep=_RecordingSleep(),
        )
