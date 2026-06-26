"""Live-trading lock — Application Service.

Wraps the pure ``live_trading_gate`` with the I/O that finds the relevant
fixture(s):
- ``player_lock``: the lock on one player right now (player -> team -> current
  fixture) — the ``place_trade`` guard's authority.
- ``locked_teams``: every team currently in a lock window — the read model behind
  ``GET /api/trading/locked`` that the UI uses to disable + explain every trade
  entry point.

A team's "current fixture" is its live one, or one just finished (within the FT
buffer), or one whose scheduled kick-off has passed (the brief pre-flip window).
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from src.config import Settings
from src.domain.match.fixture import FixtureStatus
from src.domain.trading.live_trading_gate import TradingStatus, trading_status
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.player import PlayerORM

# A real match flips UPCOMING -> LIVE within ~a minute of kick-off, so the
# pre-kickoff lock is meant to last seconds. Bound it: a fixture stuck UPCOMING
# with a kick-off long past is stale data and must NOT lock its teams forever.
_MAX_PRE_KICKOFF_LOCK = timedelta(hours=3)


@dataclass(frozen=True, slots=True)
class TeamLock:
    team_id: str
    reason: str
    reopens_at: datetime | None


def _gate(fx: FixtureORM, now: datetime, settings: Settings) -> TradingStatus:
    return trading_status(
        status=FixtureStatus(fx.status),
        state_code=fx.state_code,
        state_changed_at=fx.state_changed_at,
        kickoff_at=fx.kickoff_at,
        now=now,
        ht_buffer_s=settings.trading_ht_reopen_buffer_seconds,
        ft_buffer_s=settings.trading_ft_reopen_buffer_seconds,
        ht_window_max_s=settings.trading_ht_window_max_seconds,
    )


def _lockable_fixtures(now: datetime, settings: Settings) -> Select[tuple[FixtureORM]]:
    ft_floor = now - timedelta(seconds=settings.trading_ft_reopen_buffer_seconds)
    ko_floor = now - _MAX_PRE_KICKOFF_LOCK
    return select(FixtureORM).where(
        or_(
            FixtureORM.status == FixtureStatus.LIVE.value,
            and_(
                FixtureORM.status == FixtureStatus.FINISHED.value,
                FixtureORM.state_changed_at.is_not(None),
                FixtureORM.state_changed_at >= ft_floor,
            ),
            and_(
                FixtureORM.status == FixtureStatus.UPCOMING.value,
                FixtureORM.kickoff_at.is_not(None),
                FixtureORM.kickoff_at <= now,
                FixtureORM.kickoff_at >= ko_floor,
            ),
        )
    )


async def player_lock(
    session: AsyncSession, *, player_id: int, now: datetime, settings: Settings
) -> TradingStatus | None:
    """The trading lock on a player right now, or ``None`` when trading is open."""
    team_id = (await session.execute(select(PlayerORM.team_id).where(PlayerORM.id == player_id))).scalar_one_or_none()
    if team_id is None:
        return None
    fixtures = (
        (
            await session.execute(
                _lockable_fixtures(now, settings).where(
                    or_(FixtureORM.home_team_id == team_id, FixtureORM.away_team_id == team_id)
                )
            )
        )
        .scalars()
        .all()
    )
    for fx in fixtures:
        status = _gate(fx, now, settings)
        if status.locked:
            return status
    return None


async def locked_teams(session: AsyncSession, *, now: datetime, settings: Settings) -> list[TeamLock]:
    """Every team currently in a lock window (read model for the UI)."""
    fixtures = (await session.execute(_lockable_fixtures(now, settings))).scalars().all()
    locks: dict[str, TeamLock] = {}
    for fx in fixtures:
        status = _gate(fx, now, settings)
        if not status.locked:
            continue
        for team_id in (fx.home_team_id, fx.away_team_id):
            locks.setdefault(
                team_id,
                TeamLock(team_id=team_id, reason=status.reason.value, reopens_at=status.reopens_at),
            )
    return list(locks.values())
