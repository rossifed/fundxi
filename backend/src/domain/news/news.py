"""News domain — Entity + Value Object.

DDD roles:
- News: Entity (sportmonks-sourced).
- NewsType: Value Object (enum).
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class NewsType(StrEnum):
    PREMATCH = "prematch"
    POSTMATCH = "postmatch"


@dataclass(frozen=True, slots=True)
class News:
    id: int
    fixture_id: int | None
    league_id: int | None
    title: str
    type: NewsType
    published_at: datetime | None = None
