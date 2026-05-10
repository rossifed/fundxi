"""Pydantic DTOs for /api/players/{id}/matches.

DDD role: API contract DTO. Returns the per-match summary the PlayerSheet
needs (opponent + score + player's stat line) computed entirely from
core.fixture + core.lineup + core.match_event — no Sportmonks call.
"""

from datetime import datetime

from pydantic import BaseModel


class PlayerMatchEntryResponse(BaseModel):
    fixture_id: int
    kickoff_at: datetime | None
    home_team_id: str
    away_team_id: str
    home_score: int | None
    away_score: int | None
    status: str
    player_team_id: str
    role: str  # "starter" | "bench"
    goals: int
    assists: int
    yellow_cards: int
    red_cards: int
    in_match_pct: float | None  # price change % over the match window
