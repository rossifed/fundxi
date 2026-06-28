"""Integration test (DB-backed, rolled back): the fixture upsert never regresses
a known tournament phase to NULL.

Regression guard for the live inplay poller. ``_INPLAY_INCLUDE`` does NOT request
``stage;round``, so during a live match ``project_fixture`` yields
``stage_name=None``. The poller calls ``upsert_by_sportmonks_id`` on every poll —
without the ``coalesce(excluded, existing)`` guard that would wipe the bracket
label of a live knockout match mid-game. This proves the guard holds, and that a
real phase still updates. Skips when the local Postgres is unreachable (CI has no DB).
"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.fixture import Fixture, FixtureStatus
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository

pytestmark = pytest.mark.anyio


async def test_upsert_preserves_phase_when_payload_omits_it(isolated_session: AsyncSession) -> None:
    session = isolated_session
    row = (
        await session.execute(
            select(
                FixtureORM.sportmonks_id,
                FixtureORM.home_team_id,
                FixtureORM.away_team_id,
                FixtureORM.season_id,
            ).where(FixtureORM.sportmonks_id.is_not(None)).limit(1)
        )
    ).one()
    repo = SqlAlchemyFixtureRepository(session)

    # Phase is known (as if backfilled / ingested with stage;round).
    await repo.set_phase(sportmonks_id=row.sportmonks_id, stage_name="Round of 16", round_name="R-test")

    def _fixture(stage: str | None, round_: str | None) -> Fixture:
        # Mirrors the live inplay poller: same ids, fresh score/status, no phase.
        return Fixture(
            id=0,
            home_team_id=row.home_team_id,
            away_team_id=row.away_team_id,
            status=FixtureStatus.LIVE,
            group="",
            season_id=row.season_id,
            stage_name=stage,
            round_name=round_,
        )

    # Live-poller upsert (no phase) must NOT wipe the known phase.
    await repo.upsert_by_sportmonks_id(_fixture(None, None), sportmonks_id=row.sportmonks_id)
    after_live = (
        await session.execute(
            select(FixtureORM.stage_name, FixtureORM.round_name).where(
                FixtureORM.sportmonks_id == row.sportmonks_id
            )
        )
    ).one()
    assert after_live.stage_name == "Round of 16"
    assert after_live.round_name == "R-test"

    # A payload that DOES carry a phase still updates it (e.g. a stage rename).
    await repo.upsert_by_sportmonks_id(_fixture("Quarter-finals", None), sportmonks_id=row.sportmonks_id)
    after_phase = (
        await session.execute(
            select(FixtureORM.stage_name, FixtureORM.round_name).where(
                FixtureORM.sportmonks_id == row.sportmonks_id
            )
        )
    ).one()
    assert after_phase.stage_name == "Quarter-finals"
    # round_name absent in this payload -> preserved, not wiped.
    assert after_phase.round_name == "R-test"
