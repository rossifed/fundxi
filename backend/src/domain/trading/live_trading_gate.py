"""Live-trading gate — Domain Service (pure).

Trading on a player is FROZEN while his team's match is in play, to kill the
lag-arbitrage (buying a scorer at a stale price before our feed catches up) and
to make trading an appointment (set your team before kick-off). It re-opens:
  - at HALF-TIME, after a short buffer past the whistle (so a goal scored just
    before HT is already priced), until the second half starts;
  - at FULL-TIME, after a buffer, then permanently.

Pure function over ONE fixture's state + the clock + the configured buffers; the
application layer selects the team's current fixture and resolves I/O.
Fail-safe: anything unexpected => LOCKED (never let a trade through on doubt).
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

from src.domain.match.fixture import FixtureStatus

# Sportmonks fine state code for the half-time break.
HALF_TIME_STATE = "HT"


class TradingLockReason(StrEnum):
    OPEN = "open"
    STARTING = "starting"  # scheduled kick-off reached, lock pre-emptively
    LIVE = "live"  # match in play
    HALFTIME_SOON = "halftime_soon"  # half-time, still inside the post-whistle buffer
    FULLTIME_SOON = "fulltime_soon"  # full-time, still inside the post-whistle buffer


@dataclass(frozen=True, slots=True)
class TradingStatus:
    locked: bool
    reason: TradingLockReason
    reopens_at: datetime | None  # when trading will re-open, when known


_OPEN = TradingStatus(locked=False, reason=TradingLockReason.OPEN, reopens_at=None)


def trading_status(
    *,
    status: FixtureStatus,
    state_code: str | None,
    state_changed_at: datetime | None,
    kickoff_at: datetime | None,
    now: datetime,
    ht_buffer_s: int,
    ft_buffer_s: int,
    ht_window_max_s: int,
) -> TradingStatus:
    """Trading status for the players of ONE fixture's two teams, right now."""
    if status is FixtureStatus.UPCOMING:
        # Open until kick-off. Lock pre-emptively at the SCHEDULED kick-off so the
        # gap between real kick-off and observing the state flip can't be traded.
        if kickoff_at is not None and now >= kickoff_at:
            return TradingStatus(True, TradingLockReason.STARTING, None)
        return _OPEN

    if status is FixtureStatus.FINISHED:
        # Re-open once the post-full-time buffer has elapsed, then permanently.
        if state_changed_at is None:
            return TradingStatus(True, TradingLockReason.FULLTIME_SOON, None)
        reopen = state_changed_at + timedelta(seconds=ft_buffer_s)
        if now >= reopen:
            return _OPEN
        return TradingStatus(True, TradingLockReason.FULLTIME_SOON, reopen)

    # LIVE (and, fail-safe, any unexpected status): locked, except the half-time
    # trading window.
    if state_code == HALF_TIME_STATE and state_changed_at is not None:
        open_at = state_changed_at + timedelta(seconds=ht_buffer_s)
        close_at = state_changed_at + timedelta(seconds=ht_window_max_s)
        if open_at <= now <= close_at:
            return _OPEN  # the half-time trading window
        if now < open_at:
            return TradingStatus(True, TradingLockReason.HALFTIME_SOON, open_at)
        # Past the backstop with no observed 2nd-half flip — stay locked.
        return TradingStatus(True, TradingLockReason.LIVE, None)
    # Any in-play state (1st/2nd half, break, extra time, penalties) is locked.
    return TradingStatus(True, TradingLockReason.LIVE, None)
