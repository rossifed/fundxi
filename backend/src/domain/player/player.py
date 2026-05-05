"""Player domain — Entity + Value Objects.

DDD roles:
- Player: Entity (identity = internal int id).
- Position: Value Object (enum).
"""

from dataclasses import dataclass
from enum import StrEnum


class Position(StrEnum):
    GOALKEEPER = "GK"
    DEFENDER = "DF"
    MIDFIELDER = "MF"
    FORWARD = "FW"


@dataclass(frozen=True, slots=True)
class Player:
    id: int
    name: str
    jersey_number: int
    team_id: str
    position: Position
    full_name: str | None = None
    age: int | None = None
    foot: str | None = None
    height: int | None = None
    weight: int | None = None
    club: str | None = None
    bio: str | None = None
