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
    change_last_match: float | None  # %, net change over the latest fixture; None if no match yet
    change_this_match: float = 0.0  # %, net move WITHIN this fixture; 0 pre-kickoff / for unused subs
    formation_position: int | None = None
    # Sportmonks "row:col" tactical grid coordinate (e.g. "2:3"). When present,
    # this is the authoritative source for placing the player on the pitch;
    # otherwise the frontend falls back to a heuristic over the formation
    # string. Null for bench players and fixtures not yet ingested.
    formation_field: str | None = None


class MatchEventDTO(BaseModel):
    minute: int
    extra_minute: int | None
    type: str  # emoji-friendly label
    player_id: int | None
    player_name: str | None
    # The "other" player in a substitution (player coming OFF) or the
    # assist provider on a goal. Required by the frontend to render the
    # substitution swap on the pitch and to attribute the assist.
    related_player_id: int | None
    related_player_name: str | None
    # team_id is the team the event is CREDITED to. For an own goal this is
    # the BENEFITING team (the opponent of the scorer), already normalised at
    # ingest — so the scorer (player_name) belongs to the OTHER team.
    team_id: str | None
    headline: str | None
    info: str | None
    # True when the event is an own goal. The glyph stays "⚽" (it is a goal in
    # the feed) but the frontend renders it distinctly (red) and does not credit
    # the scorer with a normal goal.
    is_own_goal: bool = False


class MatchResponse(BaseModel):
    fixture_id: int
    home_team_id: str
    away_team_id: str
    status: str
    group: str
    home_score: int | None
    away_score: int | None
    minute: int | None
    # Hex (e.g. "#C0D6FE") of the primary kit each team wore *in this match*.
    # Sourced from Sportmonks fixture metadata (type_id 161/162). Null when
    # the fixture has not been ingested with the metadata include yet.
    home_kit_color: str | None
    away_kit_color: str | None
    # Tactical formation each team played in this fixture (e.g. "4-3-3").
    # Sourced from Sportmonks fixture metadata (type_id 159). Null when not
    # yet ingested.
    home_formation: str | None
    away_formation: str | None
    # False before the XI is published: home_xi/away_xi/home_bench/away_bench are
    # then empty and home_squad/away_squad carry both full squads instead, so the
    # match view shows who COULD play (not confirmed) rather than nothing.
    lineup_published: bool
    home_xi: list[MatchPlayerResponse]
    away_xi: list[MatchPlayerResponse]
    home_bench: list[MatchPlayerResponse]
    away_bench: list[MatchPlayerResponse]
    # Populated ONLY when lineup_published is False (squad fallback).
    home_squad: list[MatchPlayerResponse]
    away_squad: list[MatchPlayerResponse]
    events: list[MatchEventDTO]
