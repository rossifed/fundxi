"""Pydantic DTO for /api/players/screener-view.

DDD role: API contract DTO. Returns one row per player with everything the
Screener needs in a single round-trip: identity, valuation, tournament
stats, per-match window deltas, and user-context P&L. All calculations
happen server-side so the frontend stays purely rendering.
"""

from datetime import datetime

from pydantic import BaseModel


class PlayerScreenerEntryResponse(BaseModel):
    # Identity (core.player)
    id: int
    name: str
    full_name: str | None = None
    jersey_number: int
    team_id: str
    position: str
    detailed_position: str | None = None
    age: int | None = None
    foot: str | None = None
    height: int | None = None
    weight: int | None = None
    club: str | None = None
    image_path: str | None = None

    # Market (valuation engine — latest tick)
    current_price: float
    performance_rating: float
    change_24h: float
    valuation_as_of: datetime
    valuation_source: str

    # Window deltas (computed from valuation.player_price_tick)
    since_start_pct: float | None = None
    last_match_pct: float | None = None
    avg_match_pct: float | None = None

    # Tournament aggregate (core.player_tournament_stat)
    appearances: int | None = None
    minutes_played: int | None = None
    goals: int | None = None
    assists: int | None = None
    yellow_cards: int | None = None
    red_cards: int | None = None
    shots_total: int | None = None
    shots_on_target: int | None = None
    key_passes: int | None = None
    rating_avg: float | None = None

    # User context (app.holding for the default user's portfolio)
    held_shares: float = 0.0
    average_buy_price: float | None = None
    pnl: float | None = None
