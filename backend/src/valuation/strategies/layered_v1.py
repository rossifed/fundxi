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

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum

from src.domain.match.match_event import MatchEvent, MatchEventType
from src.valuation.coefficients import DEFAULT_COEFFICIENTS, PricingCoefficients
from src.valuation.strategies.events_based_v0 import compute_event_delta

# Scoring events that ripple to the whole team (layer 4). Own goals are
# excluded until the provider's team_id semantics for OG are verified on
# real data — we don't guess.
_TEAM_SCORING_TYPES = {MatchEventType.GOAL, MatchEventType.PENALTY}


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


@dataclass(frozen=True, slots=True)
class TeamRosters:
    """Per-fixture rosters for team-propagation (layer 4).

    ``by_team`` maps an internal ``team_id`` to ``[(player_id, position)]``
    for every player in that fixture's lineup (starters + bench).
    """

    by_team: Mapping[str, Sequence[tuple[int, str]]]
    home_team_id: str
    away_team_id: str


def per_event_deltas(
    event: MatchEvent,
    *,
    rosters: TeamRosters | None = None,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> list[tuple[int, float]]:
    """THE shared per-event pricing kernel.

    Every (player_id, percent_delta) a single match event produces:
      - L1 event delta for the actor / assist provider;
      - L5 substitution (player on -> +, player off -> -);
      - L4 team propagation on a team goal/penalty (every team player,
        position-aware), excluding the actor/assist (already moved by
        L1 this instant — avoids double-count + tick PK collision).

    Pure & deterministic. ``wc_replay`` (batch), the simulator sink and
    (later) the live poller ALL call this — so the three paths cannot
    produce different curves. ``rosters=None`` ⇒ L4 skipped (caller has
    no lineup context).
    """
    actors = {event.player_id, event.related_player_id}
    out: list[tuple[int, float]] = []

    # L1 — discrete event delta (actor / assist).
    for pid in actors:
        if pid is None:
            continue
        d = compute_event_delta(event, pid, coefficients=coefficients)
        if d != 0.0:
            out.append((pid, d))

    # L5 — substitution: player_id comes on, related_player_id goes off.
    if event.type is MatchEventType.SUBSTITUTION:
        if event.player_id is not None:
            out.append((event.player_id, playing_time_delta(PlayingTimeKind.SUBBED_ON, coefficients=coefficients)))
        if event.related_player_id is not None:
            out.append(
                (event.related_player_id, playing_time_delta(PlayingTimeKind.SUBBED_OFF, coefficients=coefficients))
            )

    # L4 — team propagation on a team goal/penalty.
    if rosters is not None and event.type in _TEAM_SCORING_TYPES and event.team_id is not None:
        scoring_team = event.team_id
        opponent_team = (
            rosters.away_team_id if scoring_team == rosters.home_team_id else rosters.home_team_id
        )
        for pid, pos in rosters.by_team.get(scoring_team, ()):
            if pid in actors:
                continue
            d = team_propagation_delta(scored=True, bucket=position_bucket(pos), coefficients=coefficients)
            out.append((pid, d))
        for pid, pos in rosters.by_team.get(opponent_team, ()):
            if pid in actors:
                continue
            d = team_propagation_delta(scored=False, bucket=position_bucket(pos), coefficients=coefficients)
            out.append((pid, d))

    return out
