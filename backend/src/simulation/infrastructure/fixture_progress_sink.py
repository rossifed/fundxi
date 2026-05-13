"""Sink decorator that keeps the fixture row in step with the replay.

DDD role: Adapter (driven decoration). Wraps an inner ``LiveDataSink``
and, after each event is persisted, advances ``core.fixture`` (status
``live``, current minute, running score) via a ``FixtureProgressWriter``
— so the MatchView's clock, score and scorer list move while a replay
runs, exactly as they would during a real in-play match.

The update is issued on every emit (replay volume is low — order of a
hundred events per match); the writer recomputes the score from the
goal events written so far, so it is naturally idempotent within a
minute. ``finish`` is the caller's responsibility (after the replay
loop ends).
"""

from dataclasses import dataclass

from src.simulation.domain.ports import FixtureProgressWriter, LiveDataSink
from src.simulation.domain.replay_event import ReplayEvent


@dataclass(slots=True)
class FixtureProgressSink:
    inner: LiveDataSink
    progress: FixtureProgressWriter

    async def emit(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        await self.inner.emit(event, fixture_internal_id=fixture_internal_id)
        await self.progress.advance(fixture_internal_id=fixture_internal_id, minute=event.minute)
