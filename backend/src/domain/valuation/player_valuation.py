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
    REHEARSAL = "rehearsal"  # synthetic-rating UI/UX rehearsal — NEVER real data
    SETTLEMENT = "settlement"  # full-time tournament RESULT event (win / elimination)
    QUALIFICATION = "qualification"  # group qualification (team reaches the knockout bracket)
    SUSPENSION = "suspension"  # banned for the next match (red / 2-yellow accumulation)
    LINEUP_DROP = "lineup_drop"  # dropped from the XI (started last match, benched this one)


@dataclass(frozen=True, slots=True)
class PlayerValuation:
    """All ``change_*`` values are percentages (e.g. ``5.0`` means +5%)."""

    player_id: int
    base_value: float
    current_price: float
    # Cumulative return vs the tournament-open price. The canonical "% change"
    # for screeners / top-movers. ((current_price / base_value) - 1) * 100.
    # Always a number: an un-played player legitimately sits at 0% (price = base).
    change_since_inception: float
    # Mean, over every fixture the player has been priced in, of that fixture's
    # net price change. None when the player has not been priced in any fixture
    # (no matches yet → "n/a", NOT 0%, which would read as "a flat match").
    change_avg_per_match: float | None
    # Net price change over the most recent fixture the player was priced in —
    # i.e. the latest tick's "change since that fixture's kickoff". Moves live
    # while a match is in progress, then holds until the next match's first tick.
    # None when the player has no fixture ticks yet (same n/a vs 0% reasoning).
    change_last_match: float | None
    performance_rating: float
    as_of: datetime
    source: ValuationSource
