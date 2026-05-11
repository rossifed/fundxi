"""Mutable price book maintained over the lifetime of a replay run.

DDD role: Aggregate Root for the simulation's per-player price book.
Initialised at startup with each player's base value; mutated
multiplicatively as the pricing engine reacts to each emitted match
event.

The state is owned by the simulation's wiring layer and passed into
the price-tick sink decorator. Tests can construct one directly with
any base prices they need.
"""

from dataclasses import dataclass


@dataclass(slots=True)
class PriceState:
    """Tracks the current price for every player in the simulation."""

    current_price_by_player: dict[int, float]

    def update(self, player_id: int, delta_pct: float) -> float:
        """Apply a percent delta to the player's price and return the new value.

        Raises ``KeyError`` if the player has no base price. This is a
        deliberate strict invariant: the wiring layer must seed prices
        for every player that can possibly be impacted before the
        replay starts.
        """
        prev = self.current_price_by_player.get(player_id)
        if prev is None:
            raise KeyError(f"player {player_id} has no base price in the state")
        new_price = round(prev * (1.0 + delta_pct / 100.0), 2)
        self.current_price_by_player[player_id] = new_price
        return new_price

    def current(self, player_id: int) -> float | None:
        return self.current_price_by_player.get(player_id)
