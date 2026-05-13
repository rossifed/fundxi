"""Unit tests for the inplay-window domain service."""

from datetime import UTC, datetime, timedelta

from src.ingest.domain.inplay_window import is_in_inplay_window

_KICKOFF = datetime(2026, 6, 15, 20, 0, tzinfo=UTC)


def _check(*, offset_min: int, pre: int = 60, post: int = 15, max_duration: int = 130) -> bool:
    return is_in_inplay_window(
        now=_KICKOFF + timedelta(minutes=offset_min),
        kickoff_at=_KICKOFF,
        pre_kickoff_min=pre,
        post_ft_min=post,
        max_match_duration_min=max_duration,
    )


def test_within_pre_kickoff_window_returns_true() -> None:
    assert _check(offset_min=-30) is True
    assert _check(offset_min=-60) is True  # exactly at the boundary


def test_strictly_before_pre_kickoff_window_returns_false() -> None:
    assert _check(offset_min=-61) is False


def test_during_match_returns_true() -> None:
    assert _check(offset_min=0) is True  # kickoff
    assert _check(offset_min=45) is True  # half time
    assert _check(offset_min=90) is True  # full time


def test_within_post_ft_window_returns_true() -> None:
    # 90 minutes match + 40 minutes extra time/penalties (max_duration_min=130) + 15 minutes post = 145 max
    assert _check(offset_min=130) is True
    assert _check(offset_min=145) is True


def test_strictly_after_post_ft_window_returns_false() -> None:
    assert _check(offset_min=146) is False
    assert _check(offset_min=200) is False


def test_window_respects_custom_pre_post_settings() -> None:
    # Override pre=10, post=5 → tighter window
    assert _check(offset_min=-10, pre=10, post=5) is True
    assert _check(offset_min=-11, pre=10, post=5) is False
    # 130 + 5 = 135 max
    assert _check(offset_min=135, pre=10, post=5) is True
    assert _check(offset_min=136, pre=10, post=5) is False
