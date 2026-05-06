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


DEFAULT_COEFFICIENTS = PricingCoefficients()
