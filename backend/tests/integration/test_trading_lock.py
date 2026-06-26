"""Integration test for the trading-lock application service (DB-backed, rolled back).

The pure gate is unit-tested exhaustively (test_live_trading_gate); this checks the
I/O wiring: a live fixture freezes trading for BOTH its teams' players. Skips when
the local Postgres is unreachable (CI has no DB).
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.trading_lock import locked_teams, player_lock
from src.config import get_settings
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.models.team import TeamORM

pytestmark = pytest.mark.anyio


async def test_live_match_locks_both_teams(isolated_session: AsyncSession) -> None:
    session = isolated_session
    player = (
        await session.execute(select(PlayerORM.id, PlayerORM.team_id).where(PlayerORM.team_id.is_not(None)).limit(1))
    ).first()
    assert player is not None
    player_id, team_id = player.id, player.team_id
    other_team = (await session.execute(select(TeamORM.id).where(TeamORM.id != team_id).limit(1))).scalar_one()

    now = datetime(2026, 6, 25, 20, 30, tzinfo=UTC)
    session.add(
        FixtureORM(
            home_team_id=team_id,
            away_team_id=other_team,
            status="live",
            group="A",
            state_code="INPLAY_1ST_HALF",
            state_changed_at=now - timedelta(minutes=20),
            kickoff_at=now - timedelta(minutes=20),
        )
    )
    await session.flush()

    settings = get_settings()
    lock = await player_lock(session, player_id=player_id, now=now, settings=settings)
    assert lock is not None and lock.locked is True

    teams = {t.team_id for t in await locked_teams(session, now=now, settings=settings)}
    assert team_id in teams
    assert other_team in teams  # the opponent's players are frozen too
