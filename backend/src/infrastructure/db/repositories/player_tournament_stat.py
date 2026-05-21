"""SqlAlchemyPlayerTournamentStatRepository — Adapter for tournament stats."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.player.player_tournament_stat import PlayerTournamentStat
from src.infrastructure.db.models.player_tournament_stat import PlayerTournamentStatORM


def _to_domain(orm: PlayerTournamentStatORM) -> PlayerTournamentStat:
    return PlayerTournamentStat(
        player_id=orm.player_id,
        season_id=orm.season_id,
        appearances=orm.appearances,
        minutes_played=orm.minutes_played,
        goals=orm.goals,
        assists=orm.assists,
        yellow_cards=orm.yellow_cards,
        red_cards=orm.red_cards,
        shots_total=orm.shots_total,
        shots_on_target=orm.shots_on_target,
        key_passes=orm.key_passes,
        passes_total=orm.passes_total,
        passes_accuracy=float(orm.passes_accuracy) if orm.passes_accuracy is not None else None,
        rating_avg=float(orm.rating_avg) if orm.rating_avg is not None else None,
    )


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
        stmt = pg_insert(PlayerTournamentStatORM).values(
            sportmonks_statistic_id=sportmonks_statistic_id,
            player_id=stat.player_id,
            season_id=stat.season_id,
            appearances=stat.appearances,
            minutes_played=stat.minutes_played,
            goals=stat.goals,
            assists=stat.assists,
            yellow_cards=stat.yellow_cards,
            red_cards=stat.red_cards,
            shots_total=stat.shots_total,
            shots_on_target=stat.shots_on_target,
            key_passes=stat.key_passes,
            passes_total=stat.passes_total,
            passes_accuracy=stat.passes_accuracy,
            rating_avg=stat.rating_avg,
            raw_stats=raw_stats,
        )
        update_payload = {
            "player_id": stmt.excluded.player_id,
            "season_id": stmt.excluded.season_id,
            "appearances": stmt.excluded.appearances,
            "minutes_played": stmt.excluded.minutes_played,
            "goals": stmt.excluded.goals,
            "assists": stmt.excluded.assists,
            "yellow_cards": stmt.excluded.yellow_cards,
            "red_cards": stmt.excluded.red_cards,
            "shots_total": stmt.excluded.shots_total,
            "shots_on_target": stmt.excluded.shots_on_target,
            "key_passes": stmt.excluded.key_passes,
            "passes_total": stmt.excluded.passes_total,
            "passes_accuracy": stmt.excluded.passes_accuracy,
            "rating_avg": stmt.excluded.rating_avg,
            "raw_stats": stmt.excluded.raw_stats,
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
