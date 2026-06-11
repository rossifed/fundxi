"""Unit tests for the shared pricing helpers (pure functions)."""

import pytest

from src.valuation.coefficients import DEFAULT_COEFFICIENTS as C
from src.valuation.strategies.layered_v1 import (
    StatSnapshot,
    TeamRosters,
    continuous_stat_delta,
)

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


# --- TeamRosters value object ----------------------------------------


def test_team_rosters_holds_lineups() -> None:
    rosters = TeamRosters(
        by_team={"ARG": [(1, "FW"), (2, "GK")], "FRA": [(3, "GK")]},
        home_team_id="ARG",
        away_team_id="FRA",
    )
    assert list(rosters.by_team["ARG"]) == [(1, "FW"), (2, "GK")]
    assert rosters.home_team_id == "ARG"
    assert rosters.away_team_id == "FRA"
