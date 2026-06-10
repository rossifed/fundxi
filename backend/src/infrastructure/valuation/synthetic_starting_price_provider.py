"""SyntheticStartingPriceProvider — sim/replay adapter for StartingPriceProvider.

DDD role: Adapter. The deterministic synthetic seed, kept ONLY for the
simulation/replay path (there is no real pre-tournament history to replay). Never
returns ``None`` — the synthetic seed always yields a value. Prod uses
``DbStartingPriceProvider`` instead.
"""

from datetime import datetime

from src.infrastructure.valuation.synthetic_valuation_provider import synthesize_valuation


class SyntheticStartingPriceProvider:
    def __init__(self, as_of: datetime) -> None:
        # base_value is independent of as_of, but synthesize_valuation requires it;
        # callers pass their replay clock so the adapter stays pure.
        self._as_of = as_of

    async def get_many(self, player_ids: list[int]) -> dict[int, float | None]:
        return {player_id: synthesize_valuation(player_id, as_of=self._as_of).base_value for player_id in player_ids}
