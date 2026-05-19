"""Deterministic test battery for the canonical pricing kernel (Model A).

Mirrors context/FUNDXI-VALUATION-MODEL.md §3 and the spec's test matrix.
The formula is total ⇒ its behaviour is fully specified ⇒ exhaustively
unit-testable WITHOUT any real data. Green here ⇒ internally correct &
coherent. It does NOT prove the calibration "feels" right on a real
match — that is gated on the first recorded live match.
"""

import math

import pytest

from src.valuation.coefficients import DEFAULT_COEFFICIENTS as C
from src.valuation.pricing import (
    PriceSnapshot,
    apply_tournament_event,
    live_delta,
    multiplier,
    price,
    rating_level,
    settle,
    volatility,
)
from src.valuation.strategies.layered_v1 import StatSnapshot

BASE = 50.0


def _snap(rating: float | None, *, is_live: bool = True, pressure: float | None = None) -> PriceSnapshot:
    return PriceSnapshot(rating=rating, is_live=is_live, pressure_factor=pressure)


# 1. rating_level — level semantics
@pytest.mark.parametrize(
    ("rating", "expected"),
    [(6.0, 0.0), (7.0, 0.04), (8.0, 0.08), (5.0, -0.04), (3.0, -0.12), (None, 0.0)],
)
def test_rating_level(rating: float | None, expected: float) -> None:
    assert rating_level(rating) == pytest.approx(expected)


def test_rating_level_monotonic() -> None:
    xs = [rating_level(r) for r in (3, 4, 5, 6, 7, 8, 9, 10)]
    assert xs == sorted(xs)


# 2. Reversibility — price falls when the rating falls (the core requirement)
def test_price_is_reversible_within_a_match() -> None:
    good = price(BASE, 0.0, _snap(8.0))
    faded = price(BASE, 0.0, _snap(6.2))
    bad = price(BASE, 0.0, _snap(5.0))
    assert good.price > faded.price > bad.price
    assert bad.price < BASE  # a bad performance pulls BELOW base


@pytest.mark.parametrize("rating", [5.0, 5.5, 4.0])
def test_negative_performance_pulls_price_down(rating: float) -> None:
    assert price(BASE, 0.0, _snap(rating)).price < BASE


# 3. No double-count — a goal moves price ONLY via the rating it raises
def test_no_double_count_on_goal() -> None:
    # "scored": Sportmonks lifts the rating 6.0 -> 8.0. The price move
    # must be EXACTLY the rating-level move, never rating + w_goal_pct.
    after_goal = price(BASE, 0.0, _snap(8.0))
    expected = BASE * (1.0 + rating_level(8.0) * volatility(BASE))
    assert after_goal.price == pytest.approx(round(expected, 2))
    # the legacy per-event goal % must NOT be added on top
    assert after_goal.price < BASE * (1.0 + rating_level(8.0) + C.w_goal_pct / 100.0)


# 4. Volatility — same rating, %-move scales by (50/base)^0.4
@pytest.mark.parametrize("base", [10.0, 25.0, 50.0, 100.0, 195.0])
def test_volatility_scaling(base: float) -> None:
    ld = live_delta(_snap(8.0), base)
    assert ld == pytest.approx(rating_level(8.0) * (50.0 / base) ** 0.4)


def test_small_cap_moves_harder_than_blue_chip() -> None:
    small = abs(live_delta(_snap(8.0), 10.0))
    blue = abs(live_delta(_snap(8.0), 195.0))
    assert small > blue


# 5. Pressure modulator — clamped, 1.0 = identity
@pytest.mark.parametrize(
    ("p", "expected_factor"),
    [(0.5, C.pressure_mod_min), (0.7, 0.7), (1.0, 1.0), (1.3, 1.3), (1.5, C.pressure_mod_max), (None, 1.0)],
)
def test_pressure_mod_clamped(p: float | None, expected_factor: float) -> None:
    ld = live_delta(_snap(8.0, pressure=p), BASE)
    assert ld == pytest.approx(rating_level(8.0) * volatility(BASE) * expected_factor)


# 6. Bounds — extreme inputs are clamped before volatility/pressure
def test_live_delta_bounded() -> None:
    assert live_delta(_snap(50.0), BASE) == pytest.approx(C.live_ceil_frac * volatility(BASE))
    assert live_delta(_snap(-50.0), BASE) == pytest.approx(C.live_floor_frac * volatility(BASE))


def test_multiplier_strictly_positive() -> None:
    # catastrophic tournament delta cannot drive price <= 0
    assert multiplier(-10.0, 0.0) == C.multiplier_floor
    assert price(BASE, -10.0, _snap(None, is_live=False)).price == round(BASE * C.multiplier_floor, 2)


# 7. Settlement — cash in once, then LiveDelta resets to 0
def test_settlement_then_flat_between_matches() -> None:
    live_at_ft = live_delta(_snap(7.5), BASE)
    td = settle(0.0, live_at_ft)
    assert td == pytest.approx(live_at_ft)
    # between matches: not live → price flat at base*(1+td)
    between = price(BASE, td, _snap(None, is_live=False))
    assert between.live_delta == 0.0
    assert between.price == pytest.approx(round(BASE * (1.0 + td), 2))


# 8. Accumulation, no decay — pure sum, time-independent
def test_accumulation_no_decay() -> None:
    td = 0.0
    td = settle(td, 0.05)  # match 1 settled +5%
    td = settle(td, -0.02)  # match 2 settled -2%
    td = apply_tournament_event(td, 0.05)  # qualified +5%
    assert td == pytest.approx(0.08)
    # no time argument exists anywhere → decay is structurally impossible
    flat = price(BASE, td, _snap(None, is_live=False))
    assert flat.price == pytest.approx(round(BASE * 1.08, 2))


# 9. Metric coherence — everything derives from the one result
@pytest.mark.parametrize("rating", [6.0, 7.3, 5.1, 9.0])
def test_metric_coherence(rating: float) -> None:
    td = 0.03
    r = price(BASE, td, _snap(rating))
    assert r.price == pytest.approx(round(BASE * r.multiplier, 2))
    assert r.multiplier == pytest.approx(1.0 + r.tournament_delta + r.live_delta)
    total_pct = r.price / BASE - 1.0
    assert total_pct == pytest.approx(r.multiplier - 1.0, abs=1e-3)


# 10. Tournament events persist across subsequent live polls
def test_tournament_event_persists() -> None:
    td = apply_tournament_event(0.0, -0.40)  # knockout elimination
    # still live somehow afterwards: the -40% stays under the live move
    live = price(BASE, td, _snap(7.0))
    assert live.tournament_delta == pytest.approx(-0.40)
    assert live.price == pytest.approx(round(BASE * (1.0 - 0.40 + live.live_delta), 2))


def test_snapshot_defaults_are_safe() -> None:
    # no rating, default stats, not live → zero live move, never raises
    assert live_delta(PriceSnapshot(is_live=False), BASE) == 0.0
    assert live_delta(PriceSnapshot(rating=None), BASE) == pytest.approx(0.0)


def test_stat_bonus_is_a_small_refinement() -> None:
    # a flurry of stats with a neutral rating moves far less than a
    # one-point rating change — rating is primary, stats refine.
    statful = PriceSnapshot(
        rating=6.0,
        prev_stats=StatSnapshot(),
        curr_stats=StatSnapshot(shots_on_target=3, key_passes=4, xg=0.5),
    )
    assert abs(live_delta(statful, BASE)) < abs(live_delta(_snap(7.0), BASE))
    assert not math.isnan(live_delta(statful, BASE))
