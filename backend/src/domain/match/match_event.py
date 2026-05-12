"""MatchEvent domain — structured per-player event (goal, card, sub, penalty…).

DDD roles:
- MatchEvent: Entity.
- MatchEventType: Value Object (enum). The mapping from Sportmonks `type_id`
  to our enum lives in the projector.
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol


class MatchEventType(StrEnum):
    GOAL = "goal"
    OWN_GOAL = "own_goal"
    PENALTY = "penalty"
    PENALTY_MISSED = "penalty_missed"
    YELLOW_CARD = "yellow_card"
    RED_CARD = "red_card"
    YELLOW_RED_CARD = "yellow_red_card"
    SUBSTITUTION = "substitution"
    VAR = "var"
    INJURY = "injury"
    OTHER = "other"


@dataclass(frozen=True, slots=True)
class MatchEvent:
    id: int
    fixture_id: int
    minute: int
    extra_minute: int | None
    type: MatchEventType
    player_id: int | None
    related_player_id: int | None  # assist on goal; replaced player on sub
    team_id: str | None
    info: str | None  # raw label from Sportmonks (e.g. "Penalty", "Header")
    sequence: int  # Sportmonks `sort_order`, monotonic per fixture


class MatchEventRepository(Protocol):
    async def upsert_by_sportmonks_id(self, event: MatchEvent, *, sportmonks_id: int) -> None: ...

    async def list_by_fixture(self, fixture_id: int) -> list[MatchEvent]: ...

    async def list_chronological_by_season(self, season_id: int) -> list[MatchEvent]: ...

    async def list_since_id(self, last_id: int, *, limit: int = 1000) -> list[MatchEvent]:
        """Events with internal ``id`` strictly greater than ``last_id``,
        ordered by ``(id)`` — i.e. in insert order. Used by the live
        pricing worker to consume newly-ingested events incrementally."""
        ...
