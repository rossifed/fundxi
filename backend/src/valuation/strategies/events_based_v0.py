"""EventsBasedV0 — pure pricing strategy from per-match events.

DDD role: Domain Service (pure function). Given a player's events in a
single fixture and whether they were a starter, compute the percent delta
to apply to their pre-match price.

This is the v0 model — events only, no xG, no per-match rating. The
inputs we *do* have from M5.0 are enough to generate a defensible curve:
a player who scores 2 goals + got a yellow gets +9% in this v0; a player
who got sent off after starting gets ~-7.5%.
"""

from collections import Counter

from src.domain.match.match_event import MatchEvent, MatchEventType
from src.valuation.coefficients import DEFAULT_COEFFICIENTS, PricingCoefficients


def compute_event_delta(
    event: MatchEvent,
    player_id: int,
    *,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> float:
    """Pure function: percent delta to apply to ONE player's price for ONE event.

    Used by the replay engine to emit a tick per event (granular Robinhood-
    style curve). Returns 0.0 if the event doesn't impact this player.
    """
    if event.player_id == player_id:
        match event.type:
            case MatchEventType.GOAL:
                return coefficients.w_goal_pct
            case MatchEventType.PENALTY:
                return coefficients.w_penalty_scored_pct
            case MatchEventType.PENALTY_MISSED:
                return coefficients.w_penalty_missed_pct
            case MatchEventType.OWN_GOAL:
                return coefficients.w_own_goal_pct
            case MatchEventType.YELLOW_CARD:
                return coefficients.w_yellow_card_pct
            case MatchEventType.RED_CARD:
                return coefficients.w_red_card_pct
            case MatchEventType.YELLOW_RED_CARD:
                return coefficients.w_yellow_red_card_pct
            case _:
                return 0.0
    if event.related_player_id == player_id and event.type in {MatchEventType.GOAL, MatchEventType.PENALTY}:
        # Assist on a goal/penalty.
        return coefficients.w_assist_pct
    return 0.0


def compute_player_match_delta(
    *,
    player_id: int,
    events_in_fixture: list[MatchEvent],
    was_starter: bool,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> float:
    """Percent delta to apply to the player's pre-match price.

    `events_in_fixture` is the full list of events for that fixture (any
    player, any team). Caller doesn't need to pre-filter — this function
    walks them and only counts those tied to the player_id (as actor or
    as the assist on a goal).
    """
    counts: Counter[str] = Counter()
    for ev in events_in_fixture:
        if ev.player_id == player_id:
            counts[ev.type.value] += 1
        if ev.related_player_id == player_id and ev.type in {MatchEventType.GOAL, MatchEventType.PENALTY}:
            # Goal where this player is the assist provider.
            counts["assist"] += 1

    delta = 0.0
    delta += counts[MatchEventType.GOAL.value] * coefficients.w_goal_pct
    delta += counts[MatchEventType.PENALTY.value] * coefficients.w_penalty_scored_pct
    delta += counts["assist"] * coefficients.w_assist_pct
    delta += counts[MatchEventType.PENALTY_MISSED.value] * coefficients.w_penalty_missed_pct
    delta += counts[MatchEventType.OWN_GOAL.value] * coefficients.w_own_goal_pct
    delta += counts[MatchEventType.YELLOW_CARD.value] * coefficients.w_yellow_card_pct
    delta += counts[MatchEventType.RED_CARD.value] * coefficients.w_red_card_pct
    delta += counts[MatchEventType.YELLOW_RED_CARD.value] * coefficients.w_yellow_red_card_pct

    # Clean-game bonus: starter who finished with no negative event.
    negative_count = (
        counts.get(MatchEventType.YELLOW_CARD.value, 0)
        + counts.get(MatchEventType.RED_CARD.value, 0)
        + counts.get(MatchEventType.YELLOW_RED_CARD.value, 0)
        + counts.get(MatchEventType.PENALTY_MISSED.value, 0)
        + counts.get(MatchEventType.OWN_GOAL.value, 0)
    )
    if was_starter and negative_count == 0:
        delta += coefficients.w_starter_clean_pct

    # Clamp to keep per-match noise bounded.
    delta = max(coefficients.min_delta_pct_per_match, min(coefficients.max_delta_pct_per_match, delta))
    return delta
