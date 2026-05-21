"""PlayerTournamentStat — Value Object capturing aggregated per-season stats.

DDD role: Value Object. Identity is implicit by (player_id, season_id) —
the persistence layer carries an autoincrement id but the domain doesn't
care about it.
"""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class PlayerTournamentStat:
    player_id: int
    season_id: int
    appearances: int | None = None
    minutes_played: int | None = None
    goals: int | None = None
    assists: int | None = None
    yellow_cards: int | None = None
    red_cards: int | None = None
    shots_total: int | None = None
    shots_on_target: int | None = None
    key_passes: int | None = None
    passes_total: int | None = None
    passes_accuracy: float | None = None
    rating_avg: float | None = None
