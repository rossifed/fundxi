"""PlayerTournamentStatRepository — Port for tournament-stat persistence.

DDD role: Repository port. Concrete adapter lives in
`infrastructure/db/repositories/player_tournament_stat.py`.
"""

from typing import Any, Protocol

from src.domain.player.player_tournament_stat import PlayerTournamentStat


class PlayerTournamentStatRepository(Protocol):
    async def upsert_by_sportmonks_id(
        self,
        stat: PlayerTournamentStat,
        *,
        sportmonks_statistic_id: int,
        raw_stats: dict[str, Any] | None,
    ) -> None: ...
