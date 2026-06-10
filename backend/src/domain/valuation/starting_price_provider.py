"""StartingPriceProvider — Port for a player's pre-tournament starting price (t0).

DDD role: Port (Protocol). The single home for the concept "a player's starting
price" — the anchor the whole pricing model multiplies: ``Price(t) = start * mult(t)``.
Before this port the expression ``synthesize_valuation(id).base_value`` was duplicated
across every consumer (trade, live pollers, read-model, replay); they all now depend
on this one abstraction.

Two adapters provide it (Dependency Inversion — the caller is injected with one):
- prod → reads the real ``core.player.base_value`` (Transfermarkt seed); ``None`` for a
  player with no base value → unpriceable → UI "—", never a synthetic number.
- sim/replay → the deterministic synthetic seed (no real history to replay).

``None`` means "no starting price" — callers must treat the player as unpriceable
(skip the tick / reject the trade / show "—"), never substitute a fabricated value.
"""

from typing import Protocol


class StartingPriceProvider(Protocol):
    async def get_many(self, player_ids: list[int]) -> dict[int, float | None]:
        """Starting price per player. ``None`` → no base value → unpriceable.

        Every requested id appears in the result (mapped to ``None`` when absent)."""
        ...
