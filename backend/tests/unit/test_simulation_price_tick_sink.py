"""Unit tests for the PriceTickEmittingSink decorator.

Strategy: feed the decorator a fake inner sink (just records emits), a
fake price-tick writer (just records inserts), and a real ``PriceState``
seeded with deterministic prices. Verify that:
  - non-event kinds are forwarded but produce no ticks
  - a GOAL event emits exactly one tick for the scorer at the right ts
  - the price state is updated multiplicatively
  - an event with no impacted player produces no tick
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime

import pytest

from src.simulation.domain.price_state import PriceState
from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind
from src.simulation.infrastructure.price_tick_sink import PriceTickEmittingSink

_KICKOFF = datetime(2022, 12, 18, 15, 0, 0, tzinfo=UTC)


@dataclass(slots=True)
class _RecordingInnerSink:
    emitted: list[ReplayEvent] = field(default_factory=list)

    async def emit(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        _ = fixture_internal_id
        self.emitted.append(event)


@dataclass(slots=True)
class _RecordingTickWriter:
    inserted: list[dict[str, object]] = field(default_factory=list)

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
        self.inserted.append(
            {
                "player_id": player_id,
                "ts": ts,
                "fixture_id": fixture_id,
                "current_price": current_price,
                "performance_rating": performance_rating,
                "change_since_open": change_since_open,
            }
        )


def _goal_event(*, scorer_smk: int, minute: int, sort_order: int) -> ReplayEvent:
    return ReplayEvent(
        kind=ReplayEventKind.MATCH_EVENT,
        minute=minute,
        extra_minute=None,
        sequence=sort_order,
        payload={
            "id": 1,
            "minute": minute,
            "extra_minute": None,
            "sort_order": sort_order,
            "type": {"code": "goal"},
            "player_id": scorer_smk,
        },
    )


def _comment_event() -> ReplayEvent:
    return ReplayEvent(
        kind=ReplayEventKind.MATCH_COMMENT,
        minute=10,
        extra_minute=None,
        sequence=0,
        payload={"id": 99, "minute": 10, "comment": "...", "order": 1},
    )


@pytest.mark.anyio
async def test_comment_emit_is_forwarded_without_tick() -> None:
    inner = _RecordingInnerSink()
    writer = _RecordingTickWriter()
    sink = PriceTickEmittingSink(
        inner=inner, price_ticks=writer,
        price_state=PriceState({1: 100.0}),
        fixture_kickoff=_KICKOFF,
        player_id_by_sportmonks={}, team_id_by_sportmonks={},
    )

    await sink.emit(_comment_event(), fixture_internal_id=42)

    assert len(inner.emitted) == 1
    assert inner.emitted[0].kind is ReplayEventKind.MATCH_COMMENT
    assert writer.inserted == []


@pytest.mark.anyio
async def test_goal_event_emits_tick_and_updates_price() -> None:
    inner = _RecordingInnerSink()
    writer = _RecordingTickWriter()
    state = PriceState({777: 100.0})
    sink = PriceTickEmittingSink(
        inner=inner, price_ticks=writer,
        price_state=state,
        fixture_kickoff=_KICKOFF,
        player_id_by_sportmonks={96611: 777},
        team_id_by_sportmonks={},
    )

    await sink.emit(_goal_event(scorer_smk=96611, minute=30, sort_order=4), fixture_internal_id=42)

    assert len(writer.inserted) == 1
    tick = writer.inserted[0]
    assert tick["player_id"] == 777
    assert tick["fixture_id"] == 42
    # ts = kickoff + minute*60 + sequence -> 15:00 + 30 min 4s = 15:30:04
    assert tick["ts"] == datetime(2022, 12, 18, 15, 30, 4, tzinfo=UTC)
    # change_since_open should match the v0 goal coefficient.
    delta_pct = float(tick["change_since_open"])  # type: ignore[arg-type]
    assert delta_pct > 0
    assert state.current(777) == round(100.0 * (1.0 + delta_pct / 100.0), 2)


@pytest.mark.anyio
async def test_unknown_actor_skips_tick_without_crashing() -> None:
    inner = _RecordingInnerSink()
    writer = _RecordingTickWriter()
    sink = PriceTickEmittingSink(
        inner=inner, price_ticks=writer,
        price_state=PriceState({}),  # no players seeded
        fixture_kickoff=_KICKOFF,
        player_id_by_sportmonks={96611: 777},
        team_id_by_sportmonks={},
    )

    await sink.emit(_goal_event(scorer_smk=96611, minute=30, sort_order=0), fixture_internal_id=42)

    assert writer.inserted == []


@pytest.mark.anyio
async def test_malformed_event_payload_is_silently_dropped() -> None:
    inner = _RecordingInnerSink()
    writer = _RecordingTickWriter()
    sink = PriceTickEmittingSink(
        inner=inner, price_ticks=writer,
        price_state=PriceState({777: 100.0}),
        fixture_kickoff=_KICKOFF,
        player_id_by_sportmonks={},
        team_id_by_sportmonks={},
    )

    bad_event = ReplayEvent(
        kind=ReplayEventKind.MATCH_EVENT,
        minute=30,
        extra_minute=None,
        sequence=0,
        payload={"id": "not-an-int"},
    )

    await sink.emit(bad_event, fixture_internal_id=42)

    # Inner sink still saw it (and will have logged its own skip).
    assert len(inner.emitted) == 1
    # No tick emitted.
    assert writer.inserted == []
