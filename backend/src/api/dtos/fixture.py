"""Pydantic response DTOs for the /api/fixtures routes."""

from datetime import datetime

from pydantic import BaseModel

from src.domain.match.fixture import Fixture


class FixtureResponse(BaseModel):
    id: int
    home_team_id: str
    away_team_id: str
    status: str
    group: str
    home_score: int | None = None
    away_score: int | None = None
    kickoff_at: datetime | None = None
    minute: int | None = None
    note: str | None = None
    venue_name: str | None = None
    venue_city: str | None = None
    stage_name: str | None = None
    round_name: str | None = None

    @classmethod
    def from_domain(cls, fixture: Fixture) -> "FixtureResponse":
        return cls(
            id=fixture.id,
            home_team_id=fixture.home_team_id,
            away_team_id=fixture.away_team_id,
            status=fixture.status.value,
            group=fixture.group,
            home_score=fixture.home_score,
            away_score=fixture.away_score,
            kickoff_at=fixture.kickoff_at,
            minute=fixture.minute,
            note=fixture.note,
            venue_name=fixture.venue_name,
            venue_city=fixture.venue_city,
            stage_name=fixture.stage_name,
            round_name=fixture.round_name,
        )
