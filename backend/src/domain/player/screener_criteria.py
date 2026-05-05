"""ScreenerCriteria — Value Object for the player screener filter / sort.

DDD role: Value Object (immutable, no identity).

Mirrors the frontend `ScreenerCriteria` type so the BFF contract is symmetric.
"""

from dataclasses import dataclass
from enum import StrEnum

from src.domain.player.player import Position


class SortKey(StrEnum):
    VALUE = "value"
    CHANGE = "change"
    RATING = "rating"
    AGE = "age"


class SortDirection(StrEnum):
    ASC = "asc"
    DESC = "desc"


@dataclass(frozen=True, slots=True)
class SortSpec:
    key: SortKey
    direction: SortDirection = SortDirection.DESC


@dataclass(frozen=True, slots=True)
class ScreenerCriteria:
    positions: tuple[Position, ...] | None = None
    team_ids: tuple[str, ...] | None = None
    min_value: float | None = None
    max_value: float | None = None
    search: str | None = None
    sort: SortSpec | None = None
    limit: int = 500
