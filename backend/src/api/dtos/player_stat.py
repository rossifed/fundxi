"""Pydantic response DTO for /api/players/{id}/tournament-stats."""

from pydantic import BaseModel

from src.domain.player.player_tournament_stat import PlayerTournamentStat


class PlayerTournamentStatResponse(BaseModel):
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
    rating_avg: float | None = None

    @classmethod
    def from_domain(cls, stat: PlayerTournamentStat) -> "PlayerTournamentStatResponse":
        return cls(
            player_id=stat.player_id,
            season_id=stat.season_id,
            appearances=stat.appearances,
            minutes_played=stat.minutes_played,
            goals=stat.goals,
            assists=stat.assists,
            yellow_cards=stat.yellow_cards,
            red_cards=stat.red_cards,
            shots_total=stat.shots_total,
            shots_on_target=stat.shots_on_target,
            key_passes=stat.key_passes,
            rating_avg=stat.rating_avg,
        )
