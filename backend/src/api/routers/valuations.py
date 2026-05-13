"""/api/valuations router."""

from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_session, get_valuation_provider
from src.api.dtos.player import PlayerValuationResponse
from src.application.queries import get_valuation_for_player
from src.domain.valuation.valuation_provider import ValuationProvider
from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM

router = APIRouter(prefix="/api/valuations", tags=["valuations"])


@router.get("/player/{player_id}", response_model=PlayerValuationResponse)
async def valuations_for_player(
    player_id: int,
    valuation_provider: ValuationProvider = Depends(get_valuation_provider),
) -> PlayerValuationResponse:
    valuation = await get_valuation_for_player(valuation_provider=valuation_provider, player_id=player_id)
    return PlayerValuationResponse.from_domain(valuation)


def _resample(prices: list[float], length: int) -> list[float]:
    """Resample a price series to `length` evenly-spaced samples (linear interpolation).

    - Empty input → empty output (caller should fall back to a flat baseline).
    - Single point → flat line at that value.
    - 2+ points → walk fractional indices, interpolate.
    """
    if not prices:
        return []
    if len(prices) == 1:
        return [prices[0]] * length
    if length <= 1:
        return [prices[-1]]
    out: list[float] = []
    last = len(prices) - 1
    for i in range(length):
        idx_f = (i / (length - 1)) * last
        lo = int(idx_f)
        hi = min(lo + 1, last)
        t = idx_f - lo
        out.append(prices[lo] * (1 - t) + prices[hi] * t)
    return out


@router.get("/sparklines")
async def valuations_sparklines(
    length: int = Query(default=20, ge=4, le=128),
    session: AsyncSession = Depends(get_session),
) -> dict[int, list[float]]:
    """Batch sparkline data for ALL players, derived from valuation.player_price_tick.

    Returns `{player_id: [price]}` where each list has exactly `length`
    values resampled chronologically. Players with no ticks are omitted —
    the frontend falls back to a flat baseline. One DB scan, one round-trip,
    serves both the screener and the home movers."""
    rows = (
        await session.execute(
            select(PlayerPriceTickORM.player_id, PlayerPriceTickORM.current_price).order_by(
                PlayerPriceTickORM.player_id, PlayerPriceTickORM.ts
            )
        )
    ).all()
    by_player: dict[int, list[float]] = defaultdict(list)
    for player_id, price in rows:
        by_player[player_id].append(float(price))
    return {pid: _resample(prices, length) for pid, prices in by_player.items()}
