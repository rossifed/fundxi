"""Output of the archive reader: an internally-resolved fixture plus
its chronologically-sorted timeline.

DDD role: Value Object. Decouples the use case from the resolution of
``sportmonks_id → internal fixture id``; that detail lives in the
infrastructure adapter that produces this bundle.
"""

from dataclasses import dataclass

from src.simulation.domain.replay_event import ReplayEvent


@dataclass(frozen=True, slots=True)
class ReplayFixtureBundle:
    fixture_internal_id: int
    timeline: tuple[ReplayEvent, ...]
