"""Deterministic test battery for the canonical pricing kernel (Model A).

Mirrors context/FUNDXI-VALUATION-MODEL.md §3 and the spec's test matrix.
The formula is total ⇒ its behaviour is fully specified ⇒ exhaustively
unit-testable WITHOUT any real data. Green here ⇒ internally correct &
coherent. It does NOT prove the calibration "feels" right on a real
match — that is gated on the first recorded live match.
"""

import math

import pytest

from src.valuation.pricing import (
    PriceSnapshot,
    apply_result_event,
    live_delta,
    price,
    rating_level,
    settle,
    tournament_delta_from,
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


# 3. No double-count — a goal moves price ONLY via the rating it raises.
# Spec §3.3 + §4.1: rating_level(8.0) = (8 - 6) * 4% = +8%; vol(50) = 1.00
# (spec §4.2 reference table); pressure absent ⇒ identity. Hand-computed:
# price = 50 * (1 + 0 + 0.08) = 54.00. The OLD events-only model would
# also add the per-event goal weight (+5%) → 50 * 1.13 = 56.50; that
# must NOT happen.
def test_no_double_count_on_goal() -> None:
    after_goal = price(BASE, 0.0, _snap(8.0))
    assert after_goal.price == 54.00  # literal, hand-derived from spec
    assert after_goal.price < 56.50  # the legacy goal % is NOT added on top


# 4. Volatility — anchored on the spec FORMULA `(50/base)^0.4` (§4.2,
# the authoritative equation, not the illustrative table which rounds
# loosely at some points). Values below were computed by hand with a
# calculator from the formula, NOT by running ``volatility()``:
#   (50/50)^0.4  = 1.0000 exactly
#   (50/25)^0.4  = 2^0.4    ≈ 1.3195
#   (50/10)^0.4  = 5^0.4    ≈ 1.9037
#   (50/100)^0.4 = 0.5^0.4  ≈ 0.7579
#   (50/200)^0.4 = 0.25^0.4 ≈ 0.5743
# Rating 8 ⇒ rating_level = 0.08, pressure absent ⇒ identity, so
# ld = 0.08 * vol. A bug in the formula (wrong exponent, wrong anchor)
# or in the multiplication chain would surface here.
@pytest.mark.parametrize(
    ("base", "expected_ld"),
    [
        (50.0, 0.08 * 1.0000),  # exact: 1.0
        (25.0, 0.08 * 1.3195),
        (10.0, 0.08 * 1.9037),
        (100.0, 0.08 * 0.7579),
        (200.0, 0.08 * 0.5743),
    ],
)
def test_volatility_scaling_matches_spec_formula(base: float, expected_ld: float) -> None:
    # rel=5e-4: I computed each vol to 4 decimals manually → tight tol.
    assert live_delta(_snap(8.0), base) == pytest.approx(expected_ld, rel=5e-4)


def test_small_cap_moves_harder_than_blue_chip() -> None:
    small = abs(live_delta(_snap(8.0), 10.0))
    blue = abs(live_delta(_snap(8.0), 195.0))
    assert small > blue


# 5. Pressure modulator — clamp [0.7, 1.3] (spec L3 / coefficients).
# Hand-computed: base ld pre-pressure = rating_level(8) * vol(50) = 0.08.
# Then multiplied by clamp(p, 0.7, 1.3).
@pytest.mark.parametrize(
    ("p", "expected_ld"),
    [
        (0.5, 0.08 * 0.7),  # below floor → clamped to 0.7
        (0.7, 0.08 * 0.7),
        (1.0, 0.08 * 1.0),  # identity
        (1.3, 0.08 * 1.3),
        (1.5, 0.08 * 1.3),  # above ceil → clamped to 1.3
        (None, 0.08 * 1.0),  # absent ⇒ no-op
    ],
)
def test_pressure_mod_clamped(p: float | None, expected_ld: float) -> None:
    assert live_delta(_snap(8.0, pressure=p), BASE) == pytest.approx(expected_ld)


# 6. Bounds — spec floor = -0.30, ceil = +0.40 (literal, NOT from C).
# Extreme rating ⇒ should clamp BEFORE volatility/pressure scaling.
def test_live_delta_bounded() -> None:
    # rating 50 → would be (50-6)*0.04 = 1.76, clamped to +0.40; vol(50)=1.
    assert live_delta(_snap(50.0), BASE) == pytest.approx(0.40)
    # rating -50 → would be -2.24, clamped to -0.30; vol(50)=1.
    assert live_delta(_snap(-50.0), BASE) == pytest.approx(-0.30)


def test_multiplier_strictly_positive() -> None:
    # Even with a catastrophic tournament delta, price must stay > 0
    # (spec invariant; floor = 0.05). Literal: 50 * 0.05 = 2.50.
    assert price(BASE, -10.0, _snap(None, is_live=False)).price == 2.50


# 7. Settlement — cash in once, then LiveDelta resets to 0.
# Literal: rating 7.0 ⇒ rating_level = (7-6)*0.04 = +0.04, vol(50)=1,
# no pressure → ld_at_ft = 0.04. settle(0, 0.04) must be 0.04. Then
# between matches the price must be exactly 50 * 1.04 = 52.00.
def test_settlement_then_flat_between_matches() -> None:
    assert settle(0.0, 0.04) == 0.04  # pure sum, literal
    between = price(BASE, 0.04, _snap(None, is_live=False))
    assert between.live_delta == 0.0
    assert between.price == 52.00  # literal


# 7b. Round-trip — what the kernel actually computes for a settled state
# must match the literal end-to-end value (catches a bug in either ld
# computation OR settlement folding).
def test_full_settlement_round_trip_literal() -> None:
    # Live at FT: rating 7 ⇒ ld 0.04 (computed by the kernel).
    ld_at_ft = live_delta(_snap(7.0), BASE)
    assert ld_at_ft == pytest.approx(0.04)
    # Settled into tournament_delta and observed between matches:
    td = settle(0.0, ld_at_ft)
    between = price(BASE, td, _snap(None, is_live=False))
    assert between.price == 52.00  # literal end-to-end check


# 8. Accumulation, no decay — pure sum, time-independent
def test_accumulation_no_decay() -> None:
    td = 0.0
    td = settle(td, 0.05)  # match 1 settled +5%
    td = settle(td, -0.02)  # match 2 settled -2%
    td = settle(td, 0.05)  # a further +5% banked
    assert td == pytest.approx(0.08)
    # no time argument exists anywhere → decay is structurally impossible
    flat = price(BASE, td, _snap(None, is_live=False))
    assert flat.price == pytest.approx(round(BASE * 1.08, 2))


# 9. Metric coherence — total% derived from THE price series must equal
# (price / base - 1). Literal end-to-end: rating 7 ⇒ ld 0.04, td 0.03
# ⇒ price = 50 * 1.07 = 53.50; total% = (53.50 / 50) - 1 = 0.07.
def test_metric_coherence_literal_end_to_end() -> None:
    r = price(BASE, 0.03, _snap(7.0))
    assert r.price == 53.50  # literal
    assert (r.price / BASE) - 1.0 == pytest.approx(0.07)


# 10. A tournament RESULT event persists. Elimination is multiplicative on the
# current price (-40%); the drop is read back as a persistent tournament_delta
# that never decays. Literal: 50 → 30 (settled), then live rating 7 (ld 0.04)
# ⇒ price = 50 * (1 - 0.40 + 0.04) = 50 * 0.64 = 32.00.
def test_result_event_persists() -> None:
    eliminated_price = apply_result_event(BASE, -0.40, base_value=BASE)
    assert eliminated_price == 30.00  # 50 * 0.60, multiplicative
    td = tournament_delta_from(eliminated_price, BASE)
    assert td == pytest.approx(-0.40)
    live = price(BASE, td, _snap(7.0))
    assert live.tournament_delta == pytest.approx(-0.40)
    assert live.price == 32.00  # literal end-to-end


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
