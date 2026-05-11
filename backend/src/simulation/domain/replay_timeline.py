"""Pure ordering of replay events.

DDD role: Domain Service. The match timeline has a canonical order
``(minute, extra_minute, sequence)`` that any provider's replay must
honour: a live ingest worker observes events in that order, so a
replay must too.
"""

from collections.abc import Iterable

from src.simulation.domain.replay_event import ReplayEvent


def sort_timeline(events: Iterable[ReplayEvent]) -> tuple[ReplayEvent, ...]:
    """Return ``events`` sorted by ``(minute, extra_minute or 0, sequence)``.

    ``extra_minute`` is normalised to ``0`` when absent, so a regular
    minute always comes before any stoppage-time event in that minute.
    """
    return tuple(sorted(events, key=lambda e: (e.minute, e.extra_minute or 0, e.sequence)))
