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
    # Core (since the first prototype)
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
    big_chances_missed: int | None = None
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
    errors_leading_to_goal: int | None = None
    # Discipline
    fouls: int | None = None
    own_goals: int | None = None
    # Goalkeeping
    saves: int | None = None
    goals_conceded: int | None = None
    clean_sheets: int | None = None
