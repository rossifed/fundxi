"""DbStartingPriceProvider — prod adapter for StartingPriceProvider.

DDD role: Adapter. Reads the real pre-tournament starting price from
``core.player.base_value`` (the Transfermarkt seed). A player whose ``base_value`` is
NULL has no real anchor → returns ``None`` (unpriceable → UI "—"), never a synthetic
fallback. Batched: one query for any number of players.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.player import PlayerORM


class DbStartingPriceProvider:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_many(self, player_ids: list[int]) -> dict[int, float | None]:
        if not player_ids:
            return {}
        ids = list(dict.fromkeys(player_ids))
        rows = (
            await self._session.execute(
                select(PlayerORM.id, PlayerORM.base_value).where(PlayerORM.id.in_(ids))
            )
        ).all()
        found = {row.id: (float(row.base_value) if row.base_value is not None else None) for row in rows}
        return {player_id: found.get(player_id) for player_id in player_ids}
