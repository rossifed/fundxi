"""Latest price + performance rating per player, from ``valuation.player_price_tick``.

DDD role: Adapter (driven, read side). Shared by the persistent-event use cases
(full-time settlement, group qualification): both need the price each player
walks INTO the event with — the base the multiplicative result event is applied
on top of. Batched: a single distinct-on query for any number of players.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM


async def last_price_and_rating(
    session: AsyncSession, player_ids: list[int]
) -> tuple[dict[int, float], dict[int, float]]:
    """``(last_price_by_player, last_rating_by_player)`` from each player's most
    recent tick. Players with no tick are absent from both maps (the caller
    falls back to the base value / neutral rating)."""
    if not player_ids:
        return {}, {}
    rows = (
        await session.execute(
            select(
                PlayerPriceTickORM.player_id,
                PlayerPriceTickORM.current_price,
                PlayerPriceTickORM.performance_rating,
            )
            .distinct(PlayerPriceTickORM.player_id)
            .where(PlayerPriceTickORM.player_id.in_(player_ids))
            .order_by(PlayerPriceTickORM.player_id, PlayerPriceTickORM.ts.desc())
        )
    ).all()
    last_price = {r.player_id: float(r.current_price) for r in rows}
    rating = {r.player_id: float(r.performance_rating) for r in rows}
    return last_price, rating
