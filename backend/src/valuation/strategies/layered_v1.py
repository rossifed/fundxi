"""Shared pricing helpers — pure functions used by the canonical kernel.

DDD role: Domain Service (pure). Everything here is a side-effect-free
function over plain data, so it is unit-testable in isolation and
reproducible between the batch replay and the live poller.

After the events-v0 strategy was retired (the model is now Model A only,
see ``src/valuation/pricing.py``), this module keeps just what the live
kernel and the simulation share:

- ``StatSnapshot`` + ``continuous_stat_delta`` — Layer 2: a small,
  bounded refinement to ``LiveDelta`` from the per-poll increment of a
  player's running match stats (``pricing.stat_bonus`` calls it).
- ``TeamRosters`` — per-fixture roster value object, used by the
  simulation to know which players to price each game-minute.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from src.valuation.coefficients import DEFAULT_COEFFICIENTS, PricingCoefficients


@dataclass(frozen=True, slots=True)
class StatSnapshot:
    """A point-in-time view of a player's running per-match stats.

    All fields default to 0 so a missing provider field never produces a
    spurious negative diff. xg/xa come from ``player_match_stat.raw_details``
    on the All-In plan; 0.0 when the plan/feed omits them (layer degrades
    to shots/key-passes, never invents xG).
    """

    shots_total: int = 0
    shots_on_target: int = 0
    key_passes: int = 0
    xg: float = 0.0
    xa: float = 0.0


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def continuous_stat_delta(
    *,
    prev: StatSnapshot,
    curr: StatSnapshot,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> float:
    """Layer 2: percent delta from the diff of running stats since the
    last poll. Negative diffs are floored at 0 (stats only accrue; a
    provider correction must not bleed value)."""
    d_xg = max(0.0, curr.xg - prev.xg)
    d_xa = max(0.0, curr.xa - prev.xa)
    d_sot = max(0, curr.shots_on_target - prev.shots_on_target)
    d_shots = max(0, curr.shots_total - prev.shots_total)
    d_off = max(0, d_shots - d_sot)
    d_kp = max(0, curr.key_passes - prev.key_passes)

    delta = (
        coefficients.w_xg_per_0_1_pct * (d_xg / 0.1)
        + coefficients.w_xa_per_0_1_pct * (d_xa / 0.1)
        + coefficients.w_shot_on_target_pct * d_sot
        + coefficients.w_shot_off_target_pct * d_off
        + coefficients.w_key_pass_pct * d_kp
    )
    return _clamp(delta, coefficients.min_delta_pct_per_poll, coefficients.max_delta_pct_per_poll)


@dataclass(frozen=True, slots=True)
class TeamRosters:
    """Per-fixture rosters for the simulation pricing loop.

    ``by_team`` maps an internal ``team_id`` to ``[(player_id, position)]``
    for every player in that fixture's lineup (starters + bench).
    """

    by_team: Mapping[str, Sequence[tuple[int, str]]]
    home_team_id: str
    away_team_id: str
