"""Match-shape DTO for /api/fixtures/{id}/match.

Mirrors the frontend `Match` domain type (src/domain/match/match.ts) so the
frontend's existing UI (pitch + events feed + price changes) wires onto it
with no domain-layer changes.
"""

from pydantic import BaseModel


class MatchPlayerResponse(BaseModel):
    id: int
    name: str
    full_name: str | None = None
    jersey_number: int | None
    position: str
    team_id: str
    value: float
    rating: float
    change_24h: float
    formation_position: int | None = None


class MatchEventDTO(BaseModel):
    minute: int
    extra_minute: int | None
    type: str  # emoji-friendly label
    player_id: int | None
    player_name: str | None
    team_id: str | None
    headline: str | None
    info: str | None


class MatchResponse(BaseModel):
    fixture_id: int
    home_team_id: str
    away_team_id: str
    status: str
    group: str
    home_score: int | None
    away_score: int | None
    minute: int | None
    home_xi: list[MatchPlayerResponse]
    away_xi: list[MatchPlayerResponse]
    home_bench: list[MatchPlayerResponse]
    away_bench: list[MatchPlayerResponse]
    events: list[MatchEventDTO]
    player_changes: dict[str, float]
