"""SqlAlchemyPlayerMatchStatRepository — adapter for per-match player stats."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.player_match_stat import PlayerMatchStat
from src.infrastructure.db.models.player_match_stat import PlayerMatchStatORM


def _to_domain(orm: PlayerMatchStatORM) -> PlayerMatchStat:
    return PlayerMatchStat(
        player_id=orm.player_id,
        fixture_id=orm.fixture_id,
        minutes_played=orm.minutes_played,
        shots_total=orm.shots_total,
        shots_on_target=orm.shots_on_target,
        goals=orm.goals,
        assists=orm.assists,
        yellow_cards=orm.yellow_cards,
        red_cards=orm.red_cards,
        key_passes=orm.key_passes,
        passes_total=orm.passes_total,
        passes_accuracy=float(orm.passes_accuracy) if orm.passes_accuracy is not None else None,
        rating=float(orm.rating) if orm.rating is not None else None,
    )


class SqlAlchemyPlayerMatchStatRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(
        self,
        stat: PlayerMatchStat,
        *,
        raw_details: dict[str, Any] | None = None,
    ) -> None:
        stmt = pg_insert(PlayerMatchStatORM).values(
            player_id=stat.player_id,
            fixture_id=stat.fixture_id,
            minutes_played=stat.minutes_played,
            shots_total=stat.shots_total,
            shots_on_target=stat.shots_on_target,
            goals=stat.goals,
            assists=stat.assists,
            yellow_cards=stat.yellow_cards,
            red_cards=stat.red_cards,
            key_passes=stat.key_passes,
            passes_total=stat.passes_total,
            passes_accuracy=stat.passes_accuracy,
            rating=stat.rating,
            raw_details=raw_details,
        )
        update_payload = {
            "minutes_played": stmt.excluded.minutes_played,
            "shots_total": stmt.excluded.shots_total,
            "shots_on_target": stmt.excluded.shots_on_target,
            "goals": stmt.excluded.goals,
            "assists": stmt.excluded.assists,
            "yellow_cards": stmt.excluded.yellow_cards,
            "red_cards": stmt.excluded.red_cards,
            "key_passes": stmt.excluded.key_passes,
            "passes_total": stmt.excluded.passes_total,
            "passes_accuracy": stmt.excluded.passes_accuracy,
            "rating": stmt.excluded.rating,
            "raw_details": stmt.excluded.raw_details,
            "updated_at": stmt.excluded.updated_at,
        }
        stmt = stmt.on_conflict_do_update(
            constraint="ux_player_match_stat_player_fixture",
            set_=update_payload,
        )
        await self._session.execute(stmt)

    async def list_by_fixture(self, fixture_id: int) -> list[PlayerMatchStat]:
        result = await self._session.execute(
            select(PlayerMatchStatORM)
            .where(PlayerMatchStatORM.fixture_id == fixture_id)
            .order_by(PlayerMatchStatORM.player_id)
        )
        return [_to_domain(orm) for orm in result.scalars().all()]

    async def list_by_player(self, player_id: int, *, limit: int = 50) -> list[PlayerMatchStat]:
        result = await self._session.execute(
            select(PlayerMatchStatORM)
            .where(PlayerMatchStatORM.player_id == player_id)
            .order_by(PlayerMatchStatORM.fixture_id.desc())
            .limit(limit)
        )
        return [_to_domain(orm) for orm in result.scalars().all()]
