"""Unit tests for EventsBasedV0 pricing strategy."""

from src.domain.match.match_event import MatchEvent, MatchEventType
from src.valuation.coefficients import DEFAULT_COEFFICIENTS as C
from src.valuation.strategies.events_based_v0 import compute_player_match_delta


def _event(player_id: int | None, type: MatchEventType, *, related: int | None = None, minute: int = 0) -> MatchEvent:
    return MatchEvent(
        id=0,
        fixture_id=1,
        minute=minute,
        extra_minute=None,
        type=type,
        player_id=player_id,
        related_player_id=related,
        team_id="ARG",
        info=None,
        sequence=minute,
    )


def test_clean_starter_gets_small_bonus() -> None:
    delta = compute_player_match_delta(
        player_id=42,
        events_in_fixture=[_event(99, MatchEventType.YELLOW_CARD)],  # someone else's yellow
        was_starter=True,
    )
    assert delta == C.w_starter_clean_pct


def test_goal_plus_starter_bonus() -> None:
    delta = compute_player_match_delta(
        player_id=42,
        events_in_fixture=[_event(42, MatchEventType.GOAL, minute=23)],
        was_starter=True,
    )
    assert delta == C.w_goal_pct + C.w_starter_clean_pct


def test_double_with_assist() -> None:
    """Player scores twice and assists once — close to the cap."""
    delta = compute_player_match_delta(
        player_id=42,
        events_in_fixture=[
            _event(42, MatchEventType.GOAL, minute=12),
            _event(42, MatchEventType.GOAL, minute=64),
            _event(99, MatchEventType.GOAL, related=42, minute=80),  # assist
        ],
        was_starter=True,
    )
    expected = 2 * C.w_goal_pct + C.w_assist_pct + C.w_starter_clean_pct
    assert delta == min(expected, C.max_delta_pct_per_match)


def test_yellow_strips_clean_bonus_and_subtracts() -> None:
    delta = compute_player_match_delta(
        player_id=42,
        events_in_fixture=[_event(42, MatchEventType.YELLOW_CARD)],
        was_starter=True,
    )
    assert delta == C.w_yellow_card_pct  # no clean bonus


def test_red_card_significant_drop() -> None:
    delta = compute_player_match_delta(
        player_id=42,
        events_in_fixture=[_event(42, MatchEventType.RED_CARD)],
        was_starter=True,
    )
    assert delta == C.w_red_card_pct


def test_penalty_missed() -> None:
    delta = compute_player_match_delta(
        player_id=42,
        events_in_fixture=[_event(42, MatchEventType.PENALTY_MISSED)],
        was_starter=True,
    )
    assert delta == C.w_penalty_missed_pct


def test_own_goal() -> None:
    delta = compute_player_match_delta(
        player_id=42,
        events_in_fixture=[_event(42, MatchEventType.OWN_GOAL)],
        was_starter=True,
    )
    assert delta == C.w_own_goal_pct


def test_unrelated_events_ignored() -> None:
    delta = compute_player_match_delta(
        player_id=42,
        events_in_fixture=[
            _event(99, MatchEventType.GOAL),
            _event(99, MatchEventType.YELLOW_CARD),
        ],
        was_starter=False,  # bench, not a clean-game starter
    )
    assert delta == 0.0


def test_clamp_max() -> None:
    """Quintuple goal + 3 assists exceeds the per-match cap."""
    events = [
        _event(42, MatchEventType.GOAL, minute=10),
        _event(42, MatchEventType.GOAL, minute=20),
        _event(42, MatchEventType.GOAL, minute=30),
        _event(42, MatchEventType.GOAL, minute=40),
        _event(42, MatchEventType.GOAL, minute=50),
        _event(99, MatchEventType.GOAL, related=42, minute=60),
        _event(99, MatchEventType.GOAL, related=42, minute=70),
        _event(99, MatchEventType.GOAL, related=42, minute=80),
    ]
    delta = compute_player_match_delta(
        player_id=42, events_in_fixture=events, was_starter=True
    )
    raw = 5 * C.w_goal_pct + 3 * C.w_assist_pct + C.w_starter_clean_pct
    assert raw > C.max_delta_pct_per_match
    assert delta == C.max_delta_pct_per_match


def test_clamp_min() -> None:
    """Red card + own goal + missed penalty hits the lower bound."""
    delta = compute_player_match_delta(
        player_id=42,
        events_in_fixture=[
            _event(42, MatchEventType.RED_CARD),
            _event(42, MatchEventType.OWN_GOAL),
            _event(42, MatchEventType.PENALTY_MISSED),
        ],
        was_starter=True,
    )
    raw = C.w_red_card_pct + C.w_own_goal_pct + C.w_penalty_missed_pct
    assert raw < C.min_delta_pct_per_match
    assert delta == C.min_delta_pct_per_match
