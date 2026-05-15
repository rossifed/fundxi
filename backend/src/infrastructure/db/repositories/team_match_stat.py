"""SqlAlchemyTeamMatchStatRepository — Adapter for team match stats.

Bulk upsert by (fixture_id, team_id, type_code).
"""

from collections.abc import Iterable
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.team_match_stat import TeamMatchStatORM


class SqlAlchemyTeamMatchStatRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert_batch(
        self,
        *,
        fixture_id: int,
        rows: Iterable[tuple[str, str, Decimal | None]],
    ) -> int:
        """Upsert a batch of (team_id, type_code, value) rows for a fixture.
        Returns the number of rows submitted."""
        payload = [
            {
                "fixture_id": fixture_id,
                "team_id": team_id,
                "type_code": type_code,
                "value": value,
            }
            for team_id, type_code, value in rows
        ]
        if not payload:
            return 0
        stmt = pg_insert(TeamMatchStatORM).values(payload)
        stmt = stmt.on_conflict_do_update(
            constraint="ux_team_match_stat_fixture_team_type",
            set_={"value": stmt.excluded.value, "updated_at": stmt.excluded.updated_at},
        )
        await self._session.execute(stmt)
        return len(payload)

    async def list_for_fixture(self, fixture_id: int) -> list[tuple[str, str, Decimal | None]]:
        """Returns (team_id, type_code, value) rows for a single fixture."""
        rows = await self._session.execute(
            select(TeamMatchStatORM.team_id, TeamMatchStatORM.type_code, TeamMatchStatORM.value)
            .where(TeamMatchStatORM.fixture_id == fixture_id)
        )
        return [(team_id, type_code, value) for team_id, type_code, value in rows.all()]
