"""Fixture domain — Entity + Value Object.

DDD roles:
- Fixture: Entity (identity = internal int id).
- FixtureStatus: Value Object (enum).
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class FixtureStatus(StrEnum):
    UPCOMING = "upcoming"
    LIVE = "live"
    FINISHED = "finished"


@dataclass(frozen=True, slots=True)
class Fixture:
    id: int
    home_team_id: str
    away_team_id: str
    status: FixtureStatus
    group: str
    home_score: int | None = None
    away_score: int | None = None
    kickoff_at: datetime | None = None
    minute: int | None = None
    note: str | None = None
