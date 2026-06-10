"""Pydantic response DTOs for the /api/players routes.

DDD role: API contract DTOs.
"""

from datetime import date, datetime

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
    image_path: str | None = None
    detailed_position: str | None = None
    date_of_birth: date | None = None
    birth_city: str | None = None
    nationality_name: str | None = None
    nationality_iso: str | None = None
    nationality_flag_url: str | None = None

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
            image_path=player.image_path,
            detailed_position=player.detailed_position,
            date_of_birth=player.date_of_birth,
            birth_city=player.birth_city,
            nationality_name=player.nationality_name,
            nationality_iso=player.nationality_iso,
            nationality_flag_url=player.nationality_flag_url,
        )


class PlayerValuationResponse(BaseModel):
    player_id: int
    base_value: float
    current_price: float
    change_since_inception: float  # %, vs tournament-open price — the canonical "% change"
    change_avg_per_match: float | None  # %, mean net change per fixture priced; None if no match yet
    change_last_match: float | None  # %, net change over the latest fixture; None if no match yet
    performance_rating: float
    as_of: datetime
    source: str

    @classmethod
    def from_domain(cls, valuation: PlayerValuation) -> "PlayerValuationResponse":
        return cls(
            player_id=valuation.player_id,
            base_value=valuation.base_value,
            current_price=valuation.current_price,
            change_since_inception=valuation.change_since_inception,
            change_avg_per_match=valuation.change_avg_per_match,
            change_last_match=valuation.change_last_match,
            performance_rating=valuation.performance_rating,
            as_of=valuation.as_of,
            source=valuation.source.value,
        )


class PlayerStatsBrief(BaseModel):
    """A small tournament-stat slice — what a squad/player card shows.
    Every field is nullable: a player may have no stat row yet."""

    appearances: int | None = None
    minutes_played: int | None = None
    goals: int | None = None
    assists: int | None = None
    yellow_cards: int | None = None
    red_cards: int | None = None
    passes_accuracy: float | None = None
    rating_avg: float | None = None


class PlayerWithValuationResponse(PlayerResponse):
    valuation: PlayerValuationResponse
    stats: PlayerStatsBrief | None = None

    @classmethod
    def from_pair(
        cls,
        pair: PlayerWithValuation,
        stats: PlayerStatsBrief | None = None,
    ) -> "PlayerWithValuationResponse":
        base = PlayerResponse.from_domain(pair.player)
        return cls(
            **base.model_dump(),
            valuation=PlayerValuationResponse.from_domain(pair.valuation),
            stats=stats,
        )
