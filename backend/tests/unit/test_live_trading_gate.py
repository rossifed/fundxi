"""Unit tests for the live-trading gate (pure)."""

from datetime import UTC, datetime, timedelta

from src.domain.match.fixture import FixtureStatus
from src.domain.trading.live_trading_gate import TradingLockReason, trading_status

HT_BUF = 120
FT_BUF = 300
HT_MAX = 1200
KO = datetime(2026, 6, 25, 20, 0, tzinfo=UTC)


def _status(**kw):
    base = dict(
        status=FixtureStatus.LIVE,
        state_code=None,
        state_changed_at=None,
        kickoff_at=KO,
        now=KO,
        ht_buffer_s=HT_BUF,
        ft_buffer_s=FT_BUF,
        ht_window_max_s=HT_MAX,
    )
    base.update(kw)
    return trading_status(**base)  # type: ignore[arg-type]


def test_open_before_kickoff() -> None:
    s = _status(status=FixtureStatus.UPCOMING, now=KO - timedelta(minutes=5))
    assert s.locked is False and s.reason is TradingLockReason.OPEN


def test_locks_at_scheduled_kickoff_even_before_state_flip() -> None:
    s = _status(status=FixtureStatus.UPCOMING, now=KO + timedelta(seconds=1))
    assert s.locked is True and s.reason is TradingLockReason.STARTING


def test_locked_during_first_half() -> None:
    s = _status(state_code="INPLAY_1ST_HALF", now=KO + timedelta(minutes=20))
    assert s.locked is True and s.reason is TradingLockReason.LIVE


def test_locked_during_second_half() -> None:
    s = _status(state_code="INPLAY_2ND_HALF", now=KO + timedelta(minutes=70))
    assert s.locked is True and s.reason is TradingLockReason.LIVE


def test_halftime_locked_inside_buffer_then_open() -> None:
    ht = KO + timedelta(minutes=48)
    # Inside the post-whistle buffer -> still locked, with a reopen time.
    early = _status(state_code="HT", state_changed_at=ht, now=ht + timedelta(seconds=HT_BUF - 1))
    assert early.locked is True and early.reason is TradingLockReason.HALFTIME_SOON
    assert early.reopens_at == ht + timedelta(seconds=HT_BUF)
    # After the buffer, inside the window -> OPEN (the half-time trading window).
    openw = _status(state_code="HT", state_changed_at=ht, now=ht + timedelta(seconds=HT_BUF + 1))
    assert openw.locked is False


def test_halftime_relocks_past_window_backstop() -> None:
    ht = KO + timedelta(minutes=48)
    s = _status(state_code="HT", state_changed_at=ht, now=ht + timedelta(seconds=HT_MAX + 1))
    assert s.locked is True and s.reason is TradingLockReason.LIVE


def test_fulltime_locked_inside_buffer_then_open() -> None:
    ft = KO + timedelta(minutes=100)
    locked = _status(status=FixtureStatus.FINISHED, state_changed_at=ft, now=ft + timedelta(seconds=FT_BUF - 1))
    assert locked.locked is True and locked.reason is TradingLockReason.FULLTIME_SOON
    assert locked.reopens_at == ft + timedelta(seconds=FT_BUF)
    opened = _status(status=FixtureStatus.FINISHED, state_changed_at=ft, now=ft + timedelta(seconds=FT_BUF + 1))
    assert opened.locked is False and opened.reason is TradingLockReason.OPEN


def test_finished_without_anchor_is_failsafe_locked() -> None:
    s = _status(status=FixtureStatus.FINISHED, state_changed_at=None, now=KO + timedelta(hours=3))
    assert s.locked is True
