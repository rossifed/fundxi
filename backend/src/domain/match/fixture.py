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
    # Per-match kit colors (hex). ``*_kit_color`` is the primary kit color
    # the team wore in this match; ``*_kit_palette`` is the raw CSV palette
    # for the full strip (Sportmonks metadata type_id 161 / 162).
    home_kit_color: str | None = None
    away_kit_color: str | None = None
    home_kit_palette: str | None = None
    away_kit_palette: str | None = None
    # Tactical formation each team played in this fixture (e.g. "4-3-3").
    home_formation: str | None = None
    away_formation: str | None = None
    # Stadium + tournament phase. ``stage_name`` is the raw Sportmonks label
    # ("Group Stage", "Round of 16", "Final"); ``round_name`` is the
    # matchday within a stage ("1", "2", "3" for the group stage; null for
    # knockouts). ``venue_name`` is the stadium name; city/capacity stay
    # in ``core.venue`` and are not surfaced here.
    venue_name: str | None = None
    stage_name: str | None = None
    round_name: str | None = None
