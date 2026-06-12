"""Pydantic response DTO for /api/players/{id}/tournament-stats."""

from dataclasses import asdict

from pydantic import BaseModel

from src.domain.player.player_tournament_stat import PlayerTournamentStat


class PlayerTournamentStatResponse(BaseModel):
    player_id: int
    season_id: int
    # Core
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
    # Attacking / shooting
    shots_off_target: int | None = None
    offsides: int | None = None
    big_chances_created: int | None = None
    # Passing / creation
    accurate_passes: int | None = None
    crosses_total: int | None = None
    crosses_accurate: int | None = None
    long_balls: int | None = None
    through_balls: int | None = None
    # Dribble / take-on
    dribble_attempts: int | None = None
    dribbles_completed: int | None = None
    dispossessed: int | None = None
    dribbled_past: int | None = None
    fouls_drawn: int | None = None
    # Defence / duels
    tackles: int | None = None
    interceptions: int | None = None
    clearances: int | None = None
    total_duels: int | None = None
    duels_won: int | None = None
    aerials_won: int | None = None
    shots_blocked: int | None = None
    # Discipline
    fouls: int | None = None
    # Goalkeeping
    saves: int | None = None
    goals_conceded: int | None = None

    @classmethod
    def from_domain(cls, stat: PlayerTournamentStat) -> "PlayerTournamentStatResponse":
        # VO field names match this DTO 1:1 — keep them aligned by construction.
        return cls(**asdict(stat))
