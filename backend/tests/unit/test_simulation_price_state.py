"""Unit tests for the PriceState domain Aggregate."""

import pytest

from src.simulation.domain.price_state import PriceState


def test_update_applies_multiplicative_percent_delta() -> None:
    state = PriceState({1: 100.0})

    new_price = state.update(player_id=1, delta_pct=5.0)

    assert new_price == 105.0
    assert state.current(1) == 105.0


def test_update_is_idempotent_per_player() -> None:
    state = PriceState({1: 50.0})

    after_first = state.update(player_id=1, delta_pct=10.0)
    after_second = state.update(player_id=1, delta_pct=-5.0)

    assert after_first == 55.0
    # 55 * 0.95 = 52.25
    assert after_second == 52.25
    assert state.current(1) == 52.25


def test_update_rounds_to_two_decimals() -> None:
    state = PriceState({1: 33.33})

    new_price = state.update(player_id=1, delta_pct=1.0)

    # 33.33 * 1.01 = 33.6633 → rounded to 33.66
    assert new_price == 33.66


def test_update_unknown_player_raises() -> None:
    state = PriceState({})

    with pytest.raises(KeyError, match="player 999 has no base price"):
        state.update(player_id=999, delta_pct=5.0)


def test_current_returns_none_for_unknown_player() -> None:
    state = PriceState({1: 42.0})

    assert state.current(1) == 42.0
    assert state.current(999) is None
