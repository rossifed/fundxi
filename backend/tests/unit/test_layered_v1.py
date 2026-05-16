"""Unit tests for the layered pricing strategy v1 (pure functions)."""

import pytest

from src.valuation.coefficients import DEFAULT_COEFFICIENTS as C
from src.valuation.strategies.layered_v1 import (
    PlayingTimeKind,
    PositionBucket,
    StatSnapshot,
    continuous_stat_delta,
    playing_time_delta,
    position_bucket,
    pressure_modulated,
    team_propagation_delta,
)

# --- position_bucket -------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("GK", PositionBucket.GK),
        ("Goalkeeper", PositionBucket.GK),
        ("CB", PositionBucket.DEF),
        ("LB", PositionBucket.DEF),
        ("CM", PositionBucket.MID),
        ("ST", PositionBucket.FWD),
        ("RW", PositionBucket.FWD),
        ("", PositionBucket.MID),
        (None, PositionBucket.MID),
        ("???", PositionBucket.MID),
    ],
)
def test_position_bucket(raw: str | None, expected: PositionBucket) -> None:
    assert position_bucket(raw) == expected


# --- layer 2: continuous_stat_delta ----------------------------------


def test_no_change_no_delta() -> None:
    s = StatSnapshot(shots_total=3, shots_on_target=1, key_passes=2, xg=0.5, xa=0.2)
    assert continuous_stat_delta(prev=s, curr=s) == 0.0


def test_xg_accrual_moves_price() -> None:
    prev = StatSnapshot(xg=0.10)
    curr = StatSnapshot(xg=0.30)  # +0.20 xG = 2 units of 0.1
    assert continuous_stat_delta(prev=prev, curr=curr) == pytest.approx(2 * C.w_xg_per_0_1_pct)


def test_shot_split_on_vs_off_target() -> None:
    prev = StatSnapshot()
    curr = StatSnapshot(shots_total=3, shots_on_target=1)  # 1 on, 2 off
    expected = C.w_shot_on_target_pct * 1 + C.w_shot_off_target_pct * 2
    assert continuous_stat_delta(prev=prev, curr=curr) == pytest.approx(expected)


def test_negative_diff_floored() -> None:
    """A provider correction (stat goes down) must not bleed value."""
    prev = StatSnapshot(shots_total=5, xg=0.9)
    curr = StatSnapshot(shots_total=4, xg=0.7)
    assert continuous_stat_delta(prev=prev, curr=curr) == 0.0


def test_per_poll_clamp() -> None:
    prev = StatSnapshot()
    curr = StatSnapshot(xg=5.0)  # absurd single-poll jump
    assert continuous_stat_delta(prev=prev, curr=curr) == C.max_delta_pct_per_poll


# --- layer 3: pressure_modulated -------------------------------------


def test_pressure_none_is_identity() -> None:
    assert pressure_modulated(1.5, None) == 1.5


def test_pressure_scales_within_bounds() -> None:
    assert pressure_modulated(1.0, 1.2) == pytest.approx(1.2)


def test_pressure_clamped_high_and_low() -> None:
    assert pressure_modulated(1.0, 9.0) == pytest.approx(C.pressure_mod_max)
    assert pressure_modulated(1.0, 0.01) == pytest.approx(C.pressure_mod_min)


# --- layer 4: team_propagation_delta ---------------------------------


def test_team_scored_positive_fwd_gt_gk() -> None:
    fwd = team_propagation_delta(scored=True, bucket=PositionBucket.FWD)
    gk = team_propagation_delta(scored=True, bucket=PositionBucket.GK)
    assert fwd > gk > 0


def test_team_conceded_negative_gk_worse_than_fwd() -> None:
    gk = team_propagation_delta(scored=False, bucket=PositionBucket.GK)
    fwd = team_propagation_delta(scored=False, bucket=PositionBucket.FWD)
    assert gk < fwd < 0


def test_team_propagation_magnitudes() -> None:
    assert team_propagation_delta(scored=True, bucket=PositionBucket.MID) == pytest.approx(
        C.w_team_goal_for_pct * C.pos_mult_for_mid
    )
    assert team_propagation_delta(scored=False, bucket=PositionBucket.DEF) == pytest.approx(
        -C.w_team_goal_against_pct * C.pos_mult_against_def
    )


# --- layer 5: playing_time_delta -------------------------------------


def test_playing_time_signs() -> None:
    assert playing_time_delta(PlayingTimeKind.OUT_OF_XI) < 0
    assert playing_time_delta(PlayingTimeKind.SUBBED_OFF) < 0
    assert playing_time_delta(PlayingTimeKind.UNUSED_SUB) < 0
    assert playing_time_delta(PlayingTimeKind.SUBBED_ON) > 0


def test_playing_time_values() -> None:
    assert playing_time_delta(PlayingTimeKind.OUT_OF_XI) == C.w_out_of_xi_pct
    assert playing_time_delta(PlayingTimeKind.SUBBED_ON) == C.w_subbed_on_pct
