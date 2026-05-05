"""Team domain — Entity + Value Objects.

DDD roles:
- Team: Entity (identity = ISO country code for WC2026 squads).
- TeamKind, Confederation: Value Objects (enums).
"""

from dataclasses import dataclass
from enum import StrEnum


class TeamKind(StrEnum):
    NATIONAL = "national"
    CLUB = "club"


class Confederation(StrEnum):
    UEFA = "UEFA"
    CONMEBOL = "CONMEBOL"
    CONCACAF = "CONCACAF"
    AFC = "AFC"
    CAF = "CAF"
    OFC = "OFC"


@dataclass(frozen=True, slots=True)
class Team:
    id: str
    name: str
    flag: str
    color: str
    kind: TeamKind
    confederation: Confederation | None = None
    group: str | None = None
