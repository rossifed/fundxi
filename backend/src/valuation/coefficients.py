"""Pricing model coefficients (v0).

DDD role: Configuration (constants). Centralised here so the model can be
re-tuned without touching the strategy code. Each coefficient is a percent
delta applied to the player's pre-event price.
"""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class PricingCoefficients:
    # Positive signals
    w_goal_pct: float = 5.0
    w_assist_pct: float = 3.0
    # Penalty SCORED is registered as a separate event.type='penalty' upstream;
    # it gets the same boost as a regular goal.
    w_penalty_scored_pct: float = 5.0
    # Penalty missed (event.type='penalty_missed') costs the player.
    w_penalty_missed_pct: float = -4.0
    w_own_goal_pct: float = -6.0

    # Discipline
    w_yellow_card_pct: float = -1.0
    w_red_card_pct: float = -8.0
    w_yellow_red_card_pct: float = -8.0

    # Participation
    # Bonus for a starter who finished without negative events (clean game).
    w_starter_clean_pct: float = 0.5

    # Bounds: clamp the per-match delta to keep noisy fixtures from blowing
    # the curve.
    max_delta_pct_per_match: float = 25.0
    min_delta_pct_per_match: float = -15.0

    # --- Layer 2: continuous performance (per-poll stat diff) -----------
    # Applied to the diff of core.player_match_stat running totals between
    # two polls. Small per poll; density comes from frequency, not size.
    w_xg_per_0_1_pct: float = 0.45  # per +0.10 xG accrued since last poll
    w_xa_per_0_1_pct: float = 0.30  # per +0.10 xA accrued since last poll
    w_shot_on_target_pct: float = 0.20  # per shot on target
    w_shot_off_target_pct: float = 0.06  # per off-target shot
    w_key_pass_pct: float = 0.12  # per key pass
    # Per-poll clamp — one 10-15s window can't move more than this.
    max_delta_pct_per_poll: float = 2.0
    min_delta_pct_per_poll: float = -2.0

    # --- Model A: rating-driven live multiplier ------------------------
    # LiveDelta = clamp(rating_level + stat_bonus, live_floor, live_ceil)
    #             * volatility(base) * pressure_mod
    # rating_level(r) = (r - rating_baseline) * k_rating  — a LEVEL, not a
    # delta: recomputed from the CURRENT rating every poll, so the price
    # FALLS when the rating falls (reversible by construction). Frozen v1
    # calibration items; tuned on the first real recorded match
    # (context/FUNDXI-VALUATION-MODEL.md).
    rating_baseline: float = 6.0
    k_rating: float = 0.04  # +4% of price per rating point above 6.0
    live_floor_frac: float = -0.30  # one match can't pull a player below -30%
    live_ceil_frac: float = 0.40  # ...nor above +40%
    multiplier_floor: float = 0.05  # price stays strictly positive

    # --- Layer 3: Pressure Index modulator -----------------------------
    # delta *= clamp(pressure_factor, mod_min, mod_max). 1.0 = no-op.
    pressure_mod_min: float = 0.7
    pressure_mod_max: float = 1.3

    # --- Layer 4: team propagation -------------------------------------
    # Small nudge to EVERY player of a team on a team goal for/against.
    w_team_goal_for_pct: float = 0.5
    w_team_goal_against_pct: float = 0.5  # magnitude; applied negative
    # Position multipliers. Conceding hits GK/DEF harder; scoring rewards
    # FWD/MID a touch more. Indexed by PositionBucket value.
    pos_mult_for_gk: float = 0.4
    pos_mult_for_def: float = 0.7
    pos_mult_for_mid: float = 1.0
    pos_mult_for_fwd: float = 1.3
    pos_mult_against_gk: float = 1.6
    pos_mult_against_def: float = 1.3
    pos_mult_against_mid: float = 1.0
    pos_mult_against_fwd: float = 0.7

    # --- Layer 5: playing time / bench ---------------------------------
    # Bounded + reversible (per-fixture, no permanent penalty term).
    w_out_of_xi_pct: float = -2.0  # not in announced XI (lineup publish)
    w_subbed_off_pct: float = -0.4  # accrual ends early
    w_subbed_on_pct: float = 0.8  # re-enters accrual
    w_unused_sub_pct: float = -1.0  # bench, never came on (applied once at FT)


DEFAULT_COEFFICIENTS = PricingCoefficients()
