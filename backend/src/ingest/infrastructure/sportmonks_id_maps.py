"""Snapshot ``sportmonks_id → internal_id`` mappings at process startup.

DDD role: Infrastructure helper. The Sportmonks ingest projectors take
maps keyed by Sportmonks ids; loading them once at boot avoids one
extra DB query per poll cycle (~thousand per match-day saved).

Maps are immutable during a tournament from the ingest's standpoint:
new players / teams / fixtures only appear at the daily reference
refresh (étape E), which will recompute these maps and hand them to
a fresh factory.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.models.team import TeamORM


@dataclass(frozen=True, slots=True)
class SportmonksIdMaps:
    """All lookup tables the ingest pipeline needs at startup."""

    fixture_smk_by_internal: dict[int, int]
    fixture_group_by_internal: dict[int, str]
    player_id_by_sportmonks: dict[int, int]
    team_id_by_sportmonks: dict[int, str]

    def fixture_smk_for(self, internal_id: int) -> int | None:
        return self.fixture_smk_by_internal.get(internal_id)

    def fixture_group_for(self, internal_id: int) -> str | None:
        return self.fixture_group_by_internal.get(internal_id)


async def load_sportmonks_id_maps(session: AsyncSession) -> SportmonksIdMaps:
    """Read all mappings from the live DB in three short SELECTs."""
    fixtures = (
        await session.execute(
            select(FixtureORM.id, FixtureORM.sportmonks_id, FixtureORM.group).where(
                FixtureORM.sportmonks_id.is_not(None)
            )
        )
    ).all()
    players = (
        await session.execute(
            select(PlayerORM.id, PlayerORM.sportmonks_id).where(PlayerORM.sportmonks_id.is_not(None))
        )
    ).all()
    teams = (
        await session.execute(
            select(TeamORM.id, TeamORM.sportmonks_id).where(TeamORM.sportmonks_id.is_not(None))
        )
    ).all()
    return SportmonksIdMaps(
        fixture_smk_by_internal={row.id: row.sportmonks_id for row in fixtures if row.sportmonks_id is not None},
        fixture_group_by_internal={row.id: row.group for row in fixtures if row.group is not None},
        player_id_by_sportmonks={row.sportmonks_id: row.id for row in players if row.sportmonks_id is not None},
        team_id_by_sportmonks={row.sportmonks_id: row.id for row in teams if row.sportmonks_id is not None},
    )
