"""Integration test for record_state_if_changed (DB-backed, rolled back).

Verifies the state-transition capture: a CHANGE logs a fixture_state_event row and
refreshes the fixture cache; a REPEAT of the same state is a no-op (no log spam,
the anchor time stays). Skips when the local Postgres is unreachable (CI has no DB).
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.fixture_state_event import FixtureStateEventORM
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository

pytestmark = pytest.mark.anyio


async def test_logs_on_change_and_noops_on_repeat(isolated_session: AsyncSession) -> None:
    session = isolated_session
    fixture_id = (await session.execute(select(FixtureORM.id).limit(1))).scalar_one()
    repo = SqlAlchemyFixtureRepository(session)
    t0 = datetime.now(UTC)

    # First observation of HT logs + sets the cache anchor.
    assert (
        await repo.record_state_if_changed(
            fixture_id=fixture_id,
            state_code="HT",
            state={"state": "HT", "name": "Halftime"},
            minute=45,
            observed_at=t0,
        )
        is True
    )
    cached = (
        await session.execute(
            select(FixtureORM.state_code, FixtureORM.state_changed_at).where(FixtureORM.id == fixture_id)
        )
    ).one()
    assert cached.state_code == "HT"
    assert cached.state_changed_at == t0

    # Same state again -> no-op (no new log row, anchor unchanged).
    assert (
        await repo.record_state_if_changed(
            fixture_id=fixture_id,
            state_code="HT",
            state={"state": "HT"},
            minute=46,
            observed_at=t0 + timedelta(minutes=2),
        )
        is False
    )

    # A real change -> logs again and bumps the anchor.
    assert (
        await repo.record_state_if_changed(
            fixture_id=fixture_id,
            state_code="INPLAY_2ND_HALF",
            state={"state": "INPLAY_2ND_HALF"},
            minute=46,
            observed_at=t0 + timedelta(minutes=15),
        )
        is True
    )

    logged = (
        await session.execute(
            select(func.count()).select_from(FixtureStateEventORM).where(FixtureStateEventORM.fixture_id == fixture_id)
        )
    ).scalar_one()
    assert logged == 2
    final_code = (await session.execute(select(FixtureORM.state_code).where(FixtureORM.id == fixture_id))).scalar_one()
    assert final_code == "INPLAY_2ND_HALF"
