"""ValuationProvider — Port for player valuations.

DDD role: Port (Protocol). Two adapters provide it:
- `SyntheticValuationProvider` (M3): deterministic pseudo-random output for
  pre-engine demos.
- The M5 engine reading from `valuation.player_price_tick` will plug in here
  with the same Protocol — zero changes upstream.
"""

from typing import Protocol

from src.domain.valuation.player_valuation import PlayerValuation


class ValuationProvider(Protocol):
    async def get_for_player(self, player_id: int) -> PlayerValuation: ...

    async def get_for_players(self, player_ids: list[int]) -> dict[int, PlayerValuation]: ...
