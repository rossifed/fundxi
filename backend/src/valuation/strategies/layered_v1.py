"""Layered pricing strategy v1 — pure functions.

DDD role: Domain Service (pure). Each layer is a side-effect-free
function over plain data. Layer 1 (events) stays in ``events_based_v0``;
this module adds layers 2-5. See ``backend/docs/pricing-model.md``.

Composition (multiplicative, applied by the caller per poll):

    delta_total = pressure_modulated(
        layer1_event_delta + layer2_stat_delta,
        pressure_factor,
    ) + layer4_team_delta + layer5_playing_time_delta

Nothing here touches the DB, the clock, or randomness — every output is
a deterministic function of its inputs, so it is unit-testable in
isolation and reproducible between the batch replay and the live poller.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from src.valuation.coefficients import DEFAULT_COEFFICIENTS, PricingCoefficients


class PositionBucket(StrEnum):
    GK = "GK"
    DEF = "DEF"
    MID = "MID"
    FWD = "FWD"


def position_bucket(raw: str | None) -> PositionBucket:
    """Map a provider position string to a coarse bucket.

    Defensive: unknown / missing positions fall back to MID (neutral
    multipliers), never raises — the pricing path must not break on an
    unexpected provider label.
    """
    if not raw:
        return PositionBucket.MID
    r = raw.strip().upper()
    if r in {"GK", "G", "GOALKEEPER"}:
        return PositionBucket.GK
    if r in {"DEF", "D", "DEFENDER", "CB", "LB", "RB", "RWB", "LWB"}:
        return PositionBucket.DEF
    if r in {"FWD", "F", "FW", "ATT", "ST", "CF", "LW", "RW", "FORWARD", "ATTACKER"}:
        return PositionBucket.FWD
    if r in {"MID", "M", "MF", "CM", "CDM", "CAM", "LM", "RM", "MIDFIELDER"}:
        return PositionBucket.MID
    return PositionBucket.MID


class PlayingTimeKind(StrEnum):
    OUT_OF_XI = "out_of_xi"
    SUBBED_OFF = "subbed_off"
    SUBBED_ON = "subbed_on"
    UNUSED_SUB = "unused_sub"


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


def pressure_modulated(
    delta: float,
    pressure_factor: float | None,
    *,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> float:
    """Layer 3: scale a delta by the Pressure Index factor, bounded.
    ``None`` (feed absent / not All-In) ⇒ identity (no-op, additive)."""
    if pressure_factor is None:
        return delta
    factor = _clamp(pressure_factor, coefficients.pressure_mod_min, coefficients.pressure_mod_max)
    return delta * factor


_POS_MULT_FOR = "for"
_POS_MULT_AGAINST = "against"


def team_propagation_delta(
    *,
    scored: bool,
    bucket: PositionBucket,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> float:
    """Layer 4: small nudge to a team player when their team scores
    (``scored=True``) or concedes (``scored=False``). Position-aware."""
    if scored:
        mult = {
            PositionBucket.GK: coefficients.pos_mult_for_gk,
            PositionBucket.DEF: coefficients.pos_mult_for_def,
            PositionBucket.MID: coefficients.pos_mult_for_mid,
            PositionBucket.FWD: coefficients.pos_mult_for_fwd,
        }[bucket]
        return coefficients.w_team_goal_for_pct * mult
    mult = {
        PositionBucket.GK: coefficients.pos_mult_against_gk,
        PositionBucket.DEF: coefficients.pos_mult_against_def,
        PositionBucket.MID: coefficients.pos_mult_against_mid,
        PositionBucket.FWD: coefficients.pos_mult_against_fwd,
    }[bucket]
    return -coefficients.w_team_goal_against_pct * mult


def playing_time_delta(
    kind: PlayingTimeKind,
    *,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> float:
    """Layer 5: bounded, reversible playing-time signal. Per-fixture
    delta only — there is no permanent penalty term, so a benched player
    recovers by starting the next match."""
    match kind:
        case PlayingTimeKind.OUT_OF_XI:
            return coefficients.w_out_of_xi_pct
        case PlayingTimeKind.SUBBED_OFF:
            return coefficients.w_subbed_off_pct
        case PlayingTimeKind.SUBBED_ON:
            return coefficients.w_subbed_on_pct
        case PlayingTimeKind.UNUSED_SUB:
            return coefficients.w_unused_sub_pct
