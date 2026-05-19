"""Adapter: projected per-poll stats → the pricing kernel's inputs.

DDD role: Domain Service (pure). The single bridge both the live
poller and the replay use to turn a ``PlayerMatchStat`` (what we
project from Sportmonks ``lineups.details`` every poll) into a
``PriceSnapshot`` for ``valuation.pricing.price``. Keeping it pure and
isolated means the I/O callers stay thin and the price-shaping logic
stays fully unit-testable without a DB.
"""

from src.domain.match.player_match_stat import PlayerMatchStat
from src.valuation.pricing import PriceSnapshot
from src.valuation.strategies.layered_v1 import StatSnapshot


def _stats(stat: PlayerMatchStat | None) -> StatSnapshot:
    """Map the subset of stats we actually project to a StatSnapshot.
    xG/xA are not on PlayerMatchStat (they live in raw_details on the
    All-In plan); 0.0 ⇒ the L2 term degrades to shots/key-passes, never
    invents xG. ``None`` counters ⇒ 0 (a missing field never fabricates
    a negative diff)."""
    if stat is None:
        return StatSnapshot()
    return StatSnapshot(
        shots_total=stat.shots_total or 0,
        shots_on_target=stat.shots_on_target or 0,
        key_passes=stat.key_passes or 0,
    )


def build_snapshot(
    curr: PlayerMatchStat,
    prev: PlayerMatchStat | None,
    *,
    pressure_factor: float | None,
    is_live: bool,
) -> PriceSnapshot:
    """One poll's pricing input for a player. ``curr.rating`` is the
    real Sportmonks live rating (type_id 118) — the primary driver;
    ``None`` degrades to neutral. ``prev`` is the player's previous-poll
    stat row so the L2 term sees only the increment."""
    return PriceSnapshot(
        rating=curr.rating,
        prev_stats=_stats(prev),
        curr_stats=_stats(curr),
        pressure_factor=pressure_factor,
        is_live=is_live,
    )


def tournament_delta_from(last_settled_price: float | None, base_value: float) -> float:
    """The persistent "account balance" carried into the current match,
    derived from the existing price series (no separate store):
    ``last_settled_price / base - 1``. None / non-positive base ⇒ 0.0
    (tournament start: nothing banked yet)."""
    if last_settled_price is None or base_value <= 0.0:
        return 0.0
    return last_settled_price / base_value - 1.0
