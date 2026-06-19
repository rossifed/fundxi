"""Pydantic response DTO for /api/fixtures/{id}/player-stats.

Per-player live match stats sourced from ``core.player_match_stat`` (the
Sportmonks ``lineups.details`` projection). Identity (name, photo, team) is
NOT carried here — the frontend already resolves it by ``player_id`` through
its players/valuations cache (SRP: this endpoint owns the stat line only).
"""

from pydantic import BaseModel

from src.domain.match.player_match_stat import PlayerMatchStat


class FixturePlayerStatResponse(BaseModel):
    player_id: int
    minutes_played: int | None = None
    shots_total: int | None = None
    shots_on_target: int | None = None
    goals: int | None = None
    assists: int | None = None
    yellow_cards: int | None = None
    red_cards: int | None = None
    key_passes: int | None = None
    passes_total: int | None = None
    passes_accuracy: float | None = None
    rating: float | None = None
    xg: float | None = None

    @classmethod
    def from_domain(cls, stat: PlayerMatchStat) -> "FixturePlayerStatResponse":
        # VO field names match this DTO 1:1 — keep them aligned by construction.
        return cls(
            player_id=stat.player_id,
            minutes_played=stat.minutes_played,
            shots_total=stat.shots_total,
            shots_on_target=stat.shots_on_target,
            goals=stat.goals,
            assists=stat.assists,
            yellow_cards=stat.yellow_cards,
            red_cards=stat.red_cards,
            key_passes=stat.key_passes,
            passes_total=stat.passes_total,
            passes_accuracy=stat.passes_accuracy,
            rating=stat.rating,
            xg=stat.xg,
        )
