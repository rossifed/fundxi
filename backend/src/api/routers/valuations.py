"""/api/valuations router."""

from fastapi import APIRouter, Depends

from src.api.dependencies import get_valuation_provider
from src.api.dtos.player import PlayerValuationResponse
from src.application.queries import get_valuation_for_player
from src.infrastructure.valuation.synthetic_valuation_provider import SyntheticValuationProvider

router = APIRouter(prefix="/api/valuations", tags=["valuations"])


@router.get("/player/{player_id}", response_model=PlayerValuationResponse)
async def valuations_for_player(
    player_id: int,
    valuation_provider: SyntheticValuationProvider = Depends(get_valuation_provider),
) -> PlayerValuationResponse:
    valuation = await get_valuation_for_player(valuation_provider=valuation_provider, player_id=player_id)
    return PlayerValuationResponse.from_domain(valuation)
