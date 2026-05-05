"""PlayerValuation — Value Object representing a price snapshot for a player.

DDD role: Value Object (no identity beyond player_id + as_of). Produced by the
valuation engine (M5) or by a stub provider (M3).
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class ValuationSource(StrEnum):
    SYNTHETIC = "synthetic"  # M3 placeholder: deterministic pseudo-random
    ENGINE = "engine"  # M5+: output of XGBasedStrategyV0


@dataclass(frozen=True, slots=True)
class PlayerValuation:
    player_id: int
    base_value: float
    current_price: float
    change_24h: float
    performance_rating: float
    as_of: datetime
    source: ValuationSource
