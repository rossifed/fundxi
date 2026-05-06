"""EngineValuationProvider — reads the latest tick from valuation.player_price_tick.

DDD role: Adapter implementing ValuationProvider. Drop-in replacement for
SyntheticValuationProvider. Falls back to the synthetic seed if a player
has no tick yet (e.g. before any replay run).
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.valuation.player_valuation import PlayerValuation, ValuationSource
from src.infrastructure.db.models.player_daily_snapshot import PlayerDailySnapshotORM
from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM
from src.infrastructure.valuation.synthetic_valuation_provider import synthesize_valuation


class EngineValuationProvider:
    """Reads `valuation.player_price_tick` for the latest price per player."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def _latest_tick(self, player_id: int) -> PlayerPriceTickORM | None:
        result = await self._session.execute(
            select(PlayerPriceTickORM)
            .where(PlayerPriceTickORM.player_id == player_id)
            .order_by(PlayerPriceTickORM.ts.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _latest_snapshot(self, player_id: int) -> PlayerDailySnapshotORM | None:
        result = await self._session.execute(
            select(PlayerDailySnapshotORM)
            .where(PlayerDailySnapshotORM.player_id == player_id)
            .order_by(PlayerDailySnapshotORM.date.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_for_player(self, player_id: int) -> PlayerValuation:
        tick = await self._latest_tick(player_id)
        if tick is None:
            # No tick yet → fall back to deterministic synthetic seed.
            return synthesize_valuation(player_id, as_of=datetime.now(UTC))

        snapshot = await self._latest_snapshot(player_id)
        change_24h = float(snapshot.change_24h) if snapshot is not None else float(tick.change_since_open)
        # Base value is the very-first tick (the seed).
        first_tick_result = await self._session.execute(
            select(PlayerPriceTickORM.current_price)
            .where(PlayerPriceTickORM.player_id == player_id)
            .order_by(PlayerPriceTickORM.ts.asc())
            .limit(1)
        )
        first_price = first_tick_result.scalar_one_or_none()
        base_value = float(first_price) if first_price is not None else float(tick.current_price)

        return PlayerValuation(
            player_id=player_id,
            base_value=base_value,
            current_price=float(tick.current_price),
            change_24h=round(change_24h, 2),
            performance_rating=float(tick.performance_rating),
            as_of=tick.ts,
            source=ValuationSource.ENGINE,
        )

    async def get_for_players(self, player_ids: list[int]) -> dict[int, PlayerValuation]:
        if not player_ids:
            return {}
        # Single round-trip: fetch the latest tick + first tick + latest snapshot
        # for every requested player. Done as a Python sequential loop here for
        # simplicity; M6 can swap to a window-function batch query if needed.
        result: dict[int, PlayerValuation] = {}
        for pid in player_ids:
            result[pid] = await self.get_for_player(pid)
        return result
