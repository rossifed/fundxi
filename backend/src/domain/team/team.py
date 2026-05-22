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
    # Head coach — read-time enrichment joined from core.coach. Not part of
    # the write path (ingestion links the coach via the repository's
    # ``upsert(..., coach_id=...)`` argument).
    coach_name: str | None = None
    coach_image_path: str | None = None
    coach_nationality: str | None = None
