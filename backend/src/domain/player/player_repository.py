"""PlayerRepository — Port for Player persistence.

DDD role: Repository port.
"""

from typing import Protocol

from src.domain.player.player import Player
from src.domain.player.screener_criteria import ScreenerCriteria


class PlayerRepository(Protocol):
    async def upsert_by_sportmonks_id(self, player: Player, *, sportmonks_id: int) -> None: ...

    async def list_all(self) -> list[Player]: ...

    async def get_by_id(self, player_id: int) -> Player | None: ...

    async def search(self, criteria: ScreenerCriteria) -> list[Player]: ...
