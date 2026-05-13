"""Replay a single recorded fixture into the live store.

DDD role: Application Service / Use Case. Pure orchestration over the
driven ports (``ReplayArchiveReader``, ``LiveDataSink``) and an
injected ``SleepFn``. No DB, no logging, no event-shape knowledge —
the sink owns those.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from src.simulation.domain.ports import LiveDataSink, ReplayArchiveReader, ReplayController, SleepFn
from src.simulation.domain.replay_event import ReplayEvent


@dataclass(frozen=True, slots=True)
class ReplayReport:
    fixture_internal_id: int
    minutes_played: int
    events_emitted: int
    aborted: bool = False


async def replay_match(
    *,
    fixture_sportmonks_id: int,
    speed: float,
    from_minute: int,
    archive: ReplayArchiveReader,
    sink: LiveDataSink,
    sleep: SleepFn,
    controller: ReplayController | None = None,
) -> ReplayReport:
    """Stream the fixture's timeline into the sink at simulated cadence.

    Time advances one **game minute** per real-time step of
    ``60 / speed`` seconds (``speed=60`` → 1 game minute per real
    second). Events sharing the same minute are emitted back-to-back
    in their canonical order, before the next sleep.

    ``from_minute`` lets the caller skip the early part of the match;
    events strictly before that minute are dropped and never emitted.

    An optional ``controller`` can pause or stop the run from outside:
    it is consulted at each game-minute boundary, before the inter-minute
    wait. A stop unwinds cleanly and the returned report carries
    ``aborted=True``.
    """
    if speed <= 0:
        raise ValueError(f"speed must be > 0, got {speed!r}")
    if from_minute < 0:
        raise ValueError(f"from_minute must be >= 0, got {from_minute!r}")

    bundle = await archive.load_fixture_timeline(fixture_sportmonks_id)
    timeline = tuple(e for e in bundle.timeline if e.minute >= from_minute)
    if not timeline:
        return ReplayReport(fixture_internal_id=bundle.fixture_internal_id, minutes_played=0, events_emitted=0)

    seconds_per_minute = 60.0 / speed
    events_emitted = 0
    last_minute_emitted = from_minute - 1
    aborted = False

    for minute, batch in _group_by_minute(timeline):
        if controller is not None:
            await controller.wait_while_paused()
            if controller.stop_requested():
                aborted = True
                break
        # Sleep for every game minute crossed since the previous emit, including empty ones.
        # This preserves the perceived pacing of the match (a quiet minute still takes time).
        gap = minute - last_minute_emitted
        if gap > 0:
            await sleep(seconds_per_minute * gap)
        for event in batch:
            await sink.emit(event, fixture_internal_id=bundle.fixture_internal_id)
            events_emitted += 1
        last_minute_emitted = minute

    return ReplayReport(
        fixture_internal_id=bundle.fixture_internal_id,
        minutes_played=max(0, last_minute_emitted - from_minute + 1),
        events_emitted=events_emitted,
        aborted=aborted,
    )


def _group_by_minute(timeline: Sequence[ReplayEvent]) -> list[tuple[int, list[ReplayEvent]]]:
    """Group consecutive events sharing the same ``minute`` into batches.

    Assumes ``timeline`` is already sorted (the archive reader returns
    a sorted bundle). This is a thin grouping helper, kept private to
    the use case because no other layer needs it.
    """
    groups: list[tuple[int, list[ReplayEvent]]] = []
    for event in timeline:
        if groups and groups[-1][0] == event.minute:
            groups[-1][1].append(event)
        else:
            groups.append((event.minute, [event]))
    return groups
