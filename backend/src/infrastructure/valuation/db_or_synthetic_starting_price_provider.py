"""DbOrSyntheticStartingPriceProvider — prod adapter (transitional).

DDD role: Adapter implementing StartingPriceProvider. Returns the REAL
``core.player.base_value`` (Transfermarkt seed) where present, and falls back to the
deterministic synthetic seed for the un-seeded tail (e.g. the stale WC2022 residual
players we don't seed). Never returns ``None`` — every player stays priceable.

TRANSITIONAL: the synthetic fallback exists only so un-seeded players keep a price
until they get the explicit "—" / non-tradeable path (which needs a nullable read
model through the DTO + frontend). Once that lands, prod swaps this for the pure
``DbStartingPriceProvider`` and drops the synthetic dependency. For every SEEDED
player (the full WC2026 squad) this already returns the real price.
"""

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.valuation.db_starting_price_provider import DbStartingPriceProvider
from src.infrastructure.valuation.synthetic_valuation_provider import synthesize_valuation


class DbOrSyntheticStartingPriceProvider:
    def __init__(self, session: AsyncSession, *, as_of: datetime) -> None:
        self._db = DbStartingPriceProvider(session)
        self._as_of = as_of

    async def get_many(self, player_ids: list[int]) -> dict[int, float | None]:
        real = await self._db.get_many(player_ids)
        return {
            player_id: (
                real[player_id]
                if real.get(player_id) is not None
                else synthesize_valuation(player_id, as_of=self._as_of).base_value
            )
            for player_id in player_ids
        }
