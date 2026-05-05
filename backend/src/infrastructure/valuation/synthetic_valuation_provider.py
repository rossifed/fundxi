"""SyntheticValuationProvider — M3 stub adapter for ValuationProvider.

DDD role: Adapter. Produces deterministic pseudo-random valuations from the
player_id alone — no DB access, no external call. Pure function under the hood.

Replaced in M5 by an adapter reading from `valuation.player_price_tick`. Same
Protocol, so the use cases need zero changes.

Pseudo-random recipe (deterministic, seeded by player_id):
- base_value: €5M..€120M
- current_price: base_value * (1 + change_24h)
- change_24h: -8% .. +8%
- performance_rating: 5.0 .. 9.0
"""

import hashlib
from datetime import UTC, datetime

from src.domain.valuation.player_valuation import PlayerValuation, ValuationSource


def _hashed_unit(player_id: int, salt: str) -> float:
    """Return a deterministic float in [0, 1) seeded by (player_id, salt)."""
    digest = hashlib.sha256(f"{salt}:{player_id}".encode()).digest()
    n = int.from_bytes(digest[:8], "big")
    return (n % 10_000_000) / 10_000_000.0


def synthesize_valuation(player_id: int, *, as_of: datetime) -> PlayerValuation:
    """Pure function: deterministic synthetic valuation for a player_id."""
    base_value = round(5.0 + _hashed_unit(player_id, "base") * 115.0, 2)
    change_24h = round((_hashed_unit(player_id, "change") - 0.5) * 16.0, 2)
    current_price = round(base_value * (1.0 + change_24h / 100.0), 2)
    performance_rating = round(5.0 + _hashed_unit(player_id, "rating") * 4.0, 2)
    return PlayerValuation(
        player_id=player_id,
        base_value=base_value,
        current_price=current_price,
        change_24h=change_24h,
        performance_rating=performance_rating,
        as_of=as_of,
        source=ValuationSource.SYNTHETIC,
    )


class SyntheticValuationProvider:
    """ValuationProvider adapter — synthetic seed, no I/O."""

    def __init__(self, *, as_of: datetime | None = None) -> None:
        self._as_of = as_of or datetime.now(UTC)

    async def get_for_player(self, player_id: int) -> PlayerValuation:
        return synthesize_valuation(player_id, as_of=self._as_of)

    async def get_for_players(self, player_ids: list[int]) -> dict[int, PlayerValuation]:
        return {pid: synthesize_valuation(pid, as_of=self._as_of) for pid in player_ids}
