"""Unit tests for the player-value position cap (domain, pure)."""

import pytest

from src.domain.portfolio.portfolio import TradeKind
from src.domain.portfolio.position_cap import (
    MAX_OWNERSHIP_FRACTION,
    position_after,
    would_exceed_player_cap,
    would_open_short,
)


def test_max_ownership_is_the_whole_player() -> None:
    assert MAX_OWNERSHIP_FRACTION == 1.0


@pytest.mark.parametrize(
    ("prev", "kind", "qty", "expected"),
    [
        (0.0, TradeKind.BUY, 0.5, 0.5),
        (0.5, TradeKind.BUY, 0.3, 0.8),
        (0.0, TradeKind.SELL, 0.4, -0.4),  # opens a short
        (-0.5, TradeKind.BUY, 0.7, 0.2),  # covers a short, flips long
    ],
)
def test_position_after(prev: float, kind: TradeKind, qty: float, expected: float) -> None:
    assert position_after(prev, kind, qty) == pytest.approx(expected)


def test_buy_within_the_player_value_is_allowed() -> None:
    assert not would_exceed_player_cap(prev_shares=0.5, kind=TradeKind.BUY, qty=0.5)  # exactly 100%


def test_buy_beyond_the_whole_player_is_rejected() -> None:
    assert would_exceed_player_cap(prev_shares=0.5, kind=TradeKind.BUY, qty=0.6)  # 110%


def test_short_is_capped_symmetrically_at_minus_100_percent() -> None:
    assert not would_exceed_player_cap(prev_shares=0.0, kind=TradeKind.SELL, qty=1.0)  # exactly -100%
    assert would_exceed_player_cap(prev_shares=0.0, kind=TradeKind.SELL, qty=1.2)  # -120%
    assert would_exceed_player_cap(prev_shares=-0.5, kind=TradeKind.SELL, qty=0.6)  # -110%


def test_float_tolerance_allows_landing_exactly_on_the_cap() -> None:
    # A buy sized to the remaining headroom (0.1 + 0.9) must not be rejected by drift.
    assert not would_exceed_player_cap(prev_shares=0.1, kind=TradeKind.BUY, qty=0.9)


# --- long-only rule (would_open_short) -------------------------------------


def test_buy_never_opens_a_short() -> None:
    assert not would_open_short(prev_shares=0.0, kind=TradeKind.BUY, qty=1.0)


def test_sell_within_held_long_does_not_open_a_short() -> None:
    assert not would_open_short(prev_shares=0.5, kind=TradeKind.SELL, qty=0.3)  # still long 0.2


def test_sell_exactly_the_held_long_lands_on_zero_allowed() -> None:
    assert not would_open_short(prev_shares=0.5, kind=TradeKind.SELL, qty=0.5)  # closes to 0


def test_sell_beyond_held_long_opens_a_short_rejected() -> None:
    assert would_open_short(prev_shares=0.5, kind=TradeKind.SELL, qty=0.6)  # -0.1
    assert would_open_short(prev_shares=0.0, kind=TradeKind.SELL, qty=0.4)  # short from flat
