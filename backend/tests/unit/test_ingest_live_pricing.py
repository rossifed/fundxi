"""Unit tests for the live pricing worker.

Covers ``LivePricingState.apply_delta`` and the per-batch ``_process``
method of ``LivePricingPoller`` (the part that turns MatchEvents into
ticks + notifications). DB wiring and bootstrap are covered by the
end-to-end smoke, not here.
"""

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.domain.match.match_event import MatchEvent, MatchEventType
from src.ingest.domain.live_pricing_state import LivePricingState
from src.ingest.infrastructure.live_pricing_poller import LivePricingPoller

_KICKOFF = datetime(2022, 12, 18, 15, 0, 0, tzinfo=UTC)


# --- LivePricingState -----------------------------------------------------


def test_apply_delta_multiplies_and_rounds() -> None:
    state = LivePricingState(current_price_by_player={1: 100.0}, last_event_id=0)
    new_price = state.apply_delta(1, 5.0)
    assert new_price == 105.0
    assert state.current(1) == 105.0


def test_apply_delta_compounds() -> None:
    state = LivePricingState(current_price_by_player={1: 50.0}, last_event_id=0)
    state.apply_delta(1, 10.0)  # 55.0
    after = state.apply_delta(1, -5.0)  # 55 * 0.95 = 52.25
    assert after == 52.25


def test_apply_delta_unknown_player_raises() -> None:
    state = LivePricingState(current_price_by_player={}, last_event_id=0)
    with pytest.raises(KeyError, match="player 7 has no base price"):
        state.apply_delta(7, 5.0)


# --- LivePricingPoller._process ------------------------------------------


@dataclass(slots=True)
class _RecordingPublisher:
    log: list[tuple[str, bytes]] = field(default_factory=list)

    async def publish(self, subject: str, payload: bytes) -> None:
        self.log.append((subject, payload))


def _fake_session() -> Any:
    session = MagicMock()
    session.execute = AsyncMock()
    return session


def _event(
    *,
    ev_id: int,
    fixture_id: int,
    minute: int,
    seq: int,
    type_: MatchEventType,
    player_id: int | None,
    related: int | None = None,
) -> MatchEvent:
    return MatchEvent(
        id=ev_id,
        fixture_id=fixture_id,
        minute=minute,
        extra_minute=None,
        type=type_,
        player_id=player_id,
        related_player_id=related,
        team_id="FRA",
        info=None,
        sequence=seq,
    )


def _poller_with_state(*, prices: dict[int, float], kickoffs: dict[int, datetime]) -> LivePricingPoller:
    poller = LivePricingPoller(
        poll_seconds=5.0,
        publisher=_RecordingPublisher(),
        session_factory=MagicMock(),
    )
    poller._state = LivePricingState(current_price_by_player=dict(prices), last_event_id=0)
    poller._kickoff_by_fixture = dict(kickoffs)
    return poller


@pytest.mark.anyio
async def test_goal_event_emits_tick_and_moves_price() -> None:
    poller = _poller_with_state(prices={777: 100.0}, kickoffs={65: _KICKOFF})
    session = _fake_session()
    events = [_event(ev_id=1, fixture_id=65, minute=23, seq=4, type_=MatchEventType.GOAL, player_id=777)]

    notifications, count = await poller._process(session=session, events=events)

    assert count == 1
    # one pg_insert executed
    session.execute.assert_awaited_once()
    assert len(notifications) == 1
    subject, payload = notifications[0]
    assert subject == "fundxi.player_price_tick.777"
    msg = json.loads(payload)
    assert msg["player_id"] == 777
    assert msg["fixture_id"] == 65
    delta = float(msg["change_since_open"])
    assert delta > 0
    # state updated multiplicatively
    assert poller._state is not None
    assert poller._state.current(777) == round(100.0 * (1.0 + delta / 100.0), 2)
    assert msg["current_price"] == poller._state.current(777)


@pytest.mark.anyio
async def test_non_impacting_event_emits_nothing() -> None:
    poller = _poller_with_state(prices={777: 100.0}, kickoffs={65: _KICKOFF})
    session = _fake_session()
    # SUBSTITUTION on player 777 — compute_event_delta returns 0 for subs.
    events = [_event(ev_id=1, fixture_id=65, minute=70, seq=1, type_=MatchEventType.SUBSTITUTION, player_id=777)]

    notifications, count = await poller._process(session=session, events=events)

    assert count == 0
    assert notifications == []
    session.execute.assert_not_awaited()
    assert poller._state is not None
    assert poller._state.current(777) == 100.0  # untouched


@pytest.mark.anyio
async def test_goal_with_assist_emits_two_ticks() -> None:
    poller = _poller_with_state(prices={777: 100.0, 888: 80.0}, kickoffs={65: _KICKOFF})
    session = _fake_session()
    events = [
        _event(ev_id=1, fixture_id=65, minute=36, seq=2, type_=MatchEventType.GOAL, player_id=777, related=888),
    ]

    notifications, count = await poller._process(session=session, events=events)

    assert count == 2
    subjects = sorted(s for s, _ in notifications)
    assert subjects == ["fundxi.player_price_tick.777", "fundxi.player_price_tick.888"]
    assert poller._state is not None
    assert poller._state.current(777) != 100.0  # scorer moved
    assert poller._state.current(888) != 80.0   # assister moved


@pytest.mark.anyio
async def test_event_for_fixture_without_kickoff_is_skipped() -> None:
    poller = _poller_with_state(prices={777: 100.0}, kickoffs={})  # no kickoff for fixture 65
    session = _fake_session()
    events = [_event(ev_id=1, fixture_id=65, minute=10, seq=1, type_=MatchEventType.GOAL, player_id=777)]

    notifications, count = await poller._process(session=session, events=events)

    assert count == 0
    assert notifications == []


@pytest.mark.anyio
async def test_unknown_player_gets_seeded_then_priced() -> None:
    # Player 999 is not in the price book; _process seeds it from the
    # synthetic base value, then applies the goal delta.
    poller = _poller_with_state(prices={}, kickoffs={65: _KICKOFF})
    session = _fake_session()
    events = [_event(ev_id=1, fixture_id=65, minute=10, seq=1, type_=MatchEventType.GOAL, player_id=999)]

    _, count = await poller._process(session=session, events=events)

    assert count == 1
    assert poller._state is not None
    assert 999 in poller._state.current_price_by_player
    assert poller._state.current(999) is not None
