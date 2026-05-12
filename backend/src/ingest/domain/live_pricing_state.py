"""LivePricingState — the running price book of the live pricing worker.

DDD role: Aggregate. Holds each player's current price plus the
watermark (highest ``core.match_event.id`` already turned into ticks)
so the worker can resume incrementally after a restart without
double-counting.

Mirrors the simulation's ``PriceState`` (Rule of Three: a third
occurrence would warrant lifting a shared ``PriceBook`` into the
domain layer; two is fine to duplicate).
"""

from dataclasses import dataclass


@dataclass(slots=True)
class LivePricingState:
    current_price_by_player: dict[int, float]
    last_event_id: int

    def apply_delta(self, player_id: int, delta_pct: float) -> float:
        """Multiply the player's price by ``(1 + delta_pct/100)`` and
        return the new value. Raises ``KeyError`` if the player has no
        base price — the worker must seed every player on startup."""
        prev = self.current_price_by_player.get(player_id)
        if prev is None:
            raise KeyError(f"player {player_id} has no base price in the pricing state")
        new_price = round(prev * (1.0 + delta_pct / 100.0), 2)
        self.current_price_by_player[player_id] = new_price
        return new_price

    def current(self, player_id: int) -> float | None:
        return self.current_price_by_player.get(player_id)
