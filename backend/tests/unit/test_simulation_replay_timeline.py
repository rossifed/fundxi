"""Unit tests for the timeline ordering domain service."""

from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind
from src.simulation.domain.replay_timeline import sort_timeline


def _comment(minute: int, *, extra: int | None = None, sequence: int = 0, marker: str = "") -> ReplayEvent:
    return ReplayEvent(
        kind=ReplayEventKind.MATCH_COMMENT,
        minute=minute,
        extra_minute=extra,
        sequence=sequence,
        payload={"marker": marker},
    )


def test_sort_orders_by_minute_then_extra_then_sequence() -> None:
    a = _comment(45, sequence=2, marker="a")
    b = _comment(45, extra=3, sequence=1, marker="b")
    c = _comment(45, sequence=1, marker="c")
    d = _comment(10, marker="d")
    e = _comment(45, extra=1, sequence=5, marker="e")

    sorted_events = sort_timeline([a, b, c, d, e])

    assert [evt.payload["marker"] for evt in sorted_events] == ["d", "c", "a", "e", "b"]


def test_sort_is_stable_for_identical_keys() -> None:
    a = _comment(20, sequence=1, marker="a")
    b = _comment(20, sequence=1, marker="b")

    sorted_events = sort_timeline([a, b])

    assert [evt.payload["marker"] for evt in sorted_events] == ["a", "b"]


def test_sort_handles_empty_input() -> None:
    assert sort_timeline([]) == ()


def test_sort_treats_missing_extra_as_zero() -> None:
    regular = _comment(45, marker="regular")
    stoppage = _comment(45, extra=1, marker="stoppage")

    sorted_events = sort_timeline([stoppage, regular])

    assert [evt.payload["marker"] for evt in sorted_events] == ["regular", "stoppage"]
