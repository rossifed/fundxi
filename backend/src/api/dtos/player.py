"""Pydantic response DTOs for the /api/players routes.

DDD role: API contract DTOs.
"""

from datetime import datetime

from pydantic import BaseModel

from src.application.queries import PlayerWithValuation
from src.domain.player.player import Player
from src.domain.valuation.player_valuation import PlayerValuation


class PlayerResponse(BaseModel):
    id: int
    name: str
    jersey_number: int
    team_id: str
    position: str
    full_name: str | None = None
    age: int | None = None
    foot: str | None = None
    height: int | None = None
    weight: int | None = None
    club: str | None = None
    bio: str | None = None

    @classmethod
    def from_domain(cls, player: Player) -> "PlayerResponse":
        return cls(
            id=player.id,
            name=player.name,
            jersey_number=player.jersey_number,
            team_id=player.team_id,
            position=player.position.value,
            full_name=player.full_name,
            age=player.age,
            foot=player.foot,
            height=player.height,
            weight=player.weight,
            club=player.club,
            bio=player.bio,
        )


class PlayerValuationResponse(BaseModel):
    player_id: int
    base_value: float
    current_price: float
    change_24h: float
    performance_rating: float
    as_of: datetime
    source: str

    @classmethod
    def from_domain(cls, valuation: PlayerValuation) -> "PlayerValuationResponse":
        return cls(
            player_id=valuation.player_id,
            base_value=valuation.base_value,
            current_price=valuation.current_price,
            change_24h=valuation.change_24h,
            performance_rating=valuation.performance_rating,
            as_of=valuation.as_of,
            source=valuation.source.value,
        )


class PlayerWithValuationResponse(PlayerResponse):
    valuation: PlayerValuationResponse

    @classmethod
    def from_pair(cls, pair: PlayerWithValuation) -> "PlayerWithValuationResponse":
        base = PlayerResponse.from_domain(pair.player)
        return cls(
            **base.model_dump(),
            valuation=PlayerValuationResponse.from_domain(pair.valuation),
        )
