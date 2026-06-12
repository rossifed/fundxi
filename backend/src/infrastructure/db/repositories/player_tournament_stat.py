"""SqlAlchemyPlayerTournamentStatRepository — Adapter for tournament stats."""

from dataclasses import fields
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.player.player_tournament_stat import PlayerTournamentStat
from src.infrastructure.db.models.player_tournament_stat import PlayerTournamentStatORM

# Field-driven mapping: the VO field names match the ORM column names 1:1, so
# we derive the insert/update/read sets from the dataclass. With ~35 stat
# fields this avoids the WET triple-repetition (insert values, on-conflict
# update, _to_domain) that would silently drift when a new stat is added.
_STAT_FIELDS: tuple[str, ...] = tuple(f.name for f in fields(PlayerTournamentStat))
# Stored as Numeric in PG → cast back to float on read.
_NUMERIC_FIELDS = frozenset({"passes_accuracy", "rating_avg"})


def _to_domain(orm: PlayerTournamentStatORM) -> PlayerTournamentStat:
    values: dict[str, Any] = {}
    for name in _STAT_FIELDS:
        value = getattr(orm, name)
        if name in _NUMERIC_FIELDS and value is not None:
            value = float(value)
        values[name] = value
    return PlayerTournamentStat(**values)


class SqlAlchemyPlayerTournamentStatRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert_by_sportmonks_id(
        self,
        stat: PlayerTournamentStat,
        *,
        sportmonks_statistic_id: int,
        raw_stats: dict[str, Any] | None,
    ) -> None:
        insert_values: dict[str, Any] = {name: getattr(stat, name) for name in _STAT_FIELDS}
        insert_values["sportmonks_statistic_id"] = sportmonks_statistic_id
        insert_values["raw_stats"] = raw_stats
        stmt = pg_insert(PlayerTournamentStatORM).values(**insert_values)
        # Refresh every column except the conflict key on re-ingest.
        update_payload = {
            name: getattr(stmt.excluded, name) for name in insert_values if name != "sportmonks_statistic_id"
        }
        stmt = stmt.on_conflict_do_update(index_elements=["sportmonks_statistic_id"], set_=update_payload)
        await self._session.execute(stmt)

    async def get_for_player_season(self, *, player_id: int, season_id: int) -> PlayerTournamentStat | None:
        result = await self._session.execute(
            select(PlayerTournamentStatORM).where(
                PlayerTournamentStatORM.player_id == player_id,
                PlayerTournamentStatORM.season_id == season_id,
            )
        )
        row = result.scalar_one_or_none()
        return _to_domain(row) if row else None
