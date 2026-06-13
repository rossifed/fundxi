"""Unit tests for the pure tournament-settlement domain service.

Correctness of the headline behaviour lives here: an eliminated knockout team's
players crash by -40% of their CURRENT price, regardless of how high their run
had taken them. The I/O wrapper (``application.settle_fixture``) only gathers
inputs and writes ticks; all the pricing decisions are these pure functions.
"""

import math

from src.valuation.coefficients import DEFAULT_COEFFICIENTS as C
from src.valuation.tournament import (
    SettlementTick,
    Side,
    decisive_winner,
    dropped_starters,
    is_group_stage,
    newly_suspended_players,
    per_side_impacts,
    plan_flat_impact,
    plan_impacts,
    plan_qualification,
    plan_settlement,
    qualified_team_ids,
    result_impact_frac,
)

# --- phase classification -------------------------------------------------


def test_group_stage_label_is_group() -> None:
    assert is_group_stage("Group Stage") is True
    assert is_group_stage("GROUP F") is True


def test_knockout_labels_are_not_group() -> None:
    for label in ("Round of 16", "Quarter-final", "Semi-final", "Final", "3rd Place Play-off"):
        assert is_group_stage(label) is False


def test_unknown_phase_defaults_to_group_never_fabricates_elimination() -> None:
    # None/unknown → group: we never crash a team on an unknown phase.
    assert is_group_stage(None) is True


# --- winner determination -------------------------------------------------


def test_decisive_winner_home_and_away() -> None:
    assert decisive_winner(2, 1) is Side.HOME
    assert decisive_winner(0, 3) is Side.AWAY


def test_level_or_unknown_score_has_no_decisive_winner() -> None:
    # A level knockout (penalties) is undetermined from these scores.
    assert decisive_winner(1, 1) is None
    assert decisive_winner(None, 1) is None
    assert decisive_winner(2, None) is None


# --- result impact per team ----------------------------------------------


def test_group_win_pays_plus_2_loss_and_draw_pay_zero() -> None:
    assert result_impact_frac(is_group=True, is_winner=True, is_loser=False) == C.w_group_win_frac
    assert result_impact_frac(is_group=True, is_winner=False, is_loser=False) == 0.0


def test_knockout_win_advances_loss_eliminates() -> None:
    assert result_impact_frac(is_group=False, is_winner=True, is_loser=False) == C.w_knockout_win_frac
    assert result_impact_frac(is_group=False, is_winner=False, is_loser=True) == C.w_knockout_elimination_frac


def test_per_side_knockout_home_win_eliminates_away() -> None:
    home, away = per_side_impacts(is_group=False, winner=Side.HOME)
    assert home == C.w_knockout_win_frac
    assert away == C.w_knockout_elimination_frac


def test_per_side_group_only_winner_paid() -> None:
    home, away = per_side_impacts(is_group=True, winner=Side.AWAY)
    assert home == 0.0
    assert away == C.w_group_win_frac


def test_per_side_undetermined_is_zero_zero() -> None:
    assert per_side_impacts(is_group=False, winner=None) == (0.0, 0.0)


# --- settlement planning (the crash) -------------------------------------


def _roster() -> list[tuple[int, str]]:
    # Two home players (FRA), two away players (ARG).
    return [(1, "FRA"), (2, "FRA"), (10, "ARG"), (11, "ARG")]


def test_knockout_elimination_crashes_loser_by_40pct_of_current_price() -> None:
    # FRA beat ARG in a knockout. ARG players are eliminated: -40% of their
    # CURRENT price (not their base) — a great run makes the fall bigger in
    # absolute terms, which is the point.
    base = {1: 100.0, 2: 100.0, 10: 50.0, 11: 50.0}
    # ARG#10 had a stellar tournament (price 200 on a 50 base); ARG#11 sits flat.
    last = {1: 130.0, 2: 130.0, 10: 200.0, 11: 50.0}
    ticks = plan_settlement(
        home_team_id="FRA",
        away_team_id="ARG",
        is_group=False,
        winner=Side.HOME,
        roster=_roster(),
        base_by_player=base,
        last_price_by_player=last,
        rating_by_player={},
    )
    by_player = {t.player_id: t for t in ticks}
    # Winners (FRA) advance: +5% of 130 = 136.50.
    assert by_player[1].price == 136.50
    assert by_player[2].price == 136.50
    # Losers (ARG) eliminated: -40% of current.
    assert by_player[10].price == 120.00  # 200 * 0.6
    assert by_player[11].price == 30.00  # 50 * 0.6
    # Settlement carries the neutral baseline rating fallback when none is supplied.
    assert all(t.rating == C.rating_baseline for t in ticks)


def test_elimination_is_floored_strictly_positive() -> None:
    # An already-tiny price can't be driven to zero by the -40% (spec Q3).
    base = {10: 50.0}
    last = {10: 1.0}  # well below base
    ticks = plan_settlement(
        home_team_id="FRA",
        away_team_id="ARG",
        is_group=False,
        winner=Side.HOME,
        roster=[(10, "ARG")],
        base_by_player=base,
        last_price_by_player=last,
        rating_by_player={},
    )
    # floor = base * multiplier_floor = 50 * 0.05 = 2.50 > 1.0 * 0.6 = 0.60.
    assert ticks[0].price == round(50.0 * C.multiplier_floor, 2)
    assert ticks[0].price > 0.0


def test_no_prior_tick_uses_base_as_current_price() -> None:
    # An unused sub (no tick) still shares the elimination: -40% of his base.
    ticks = plan_settlement(
        home_team_id="FRA",
        away_team_id="ARG",
        is_group=False,
        winner=Side.HOME,
        roster=[(11, "ARG")],
        base_by_player={11: 50.0},
        last_price_by_player={},  # never priced
        rating_by_player={},
    )
    assert ticks[0].price == 30.00  # 50 * 0.6


def test_unseeded_player_is_skipped_never_synthesised() -> None:
    ticks = plan_settlement(
        home_team_id="FRA",
        away_team_id="ARG",
        is_group=False,
        winner=Side.HOME,
        roster=[(11, "ARG")],
        base_by_player={11: None},  # un-seeded → unpriceable
        last_price_by_player={},
        rating_by_player={},
    )
    assert ticks == []


def test_group_draw_settles_nothing() -> None:
    ticks = plan_settlement(
        home_team_id="FRA",
        away_team_id="ARG",
        is_group=True,
        winner=None,
        roster=_roster(),
        base_by_player={1: 100.0, 2: 100.0, 10: 50.0, 11: 50.0},
        last_price_by_player={},
        rating_by_player={},
    )
    assert ticks == []


def test_group_win_settles_only_the_winning_squad() -> None:
    ticks = plan_settlement(
        home_team_id="FRA",
        away_team_id="ARG",
        is_group=True,
        winner=Side.HOME,
        roster=_roster(),
        base_by_player={1: 100.0, 2: 100.0, 10: 50.0, 11: 50.0},
        last_price_by_player={1: 100.0, 2: 100.0, 10: 50.0, 11: 50.0},
        rating_by_player={},
    )
    settled = {t.player_id for t in ticks}
    assert settled == {1, 2}  # ARG (losers) get nothing in a group match
    assert all(math.isclose(t.price, 102.0) for t in ticks)  # +2% of 100


def test_settled_rating_is_carried_from_last_tick() -> None:
    ticks = plan_settlement(
        home_team_id="FRA",
        away_team_id="ARG",
        is_group=False,
        winner=Side.AWAY,
        roster=[(1, "FRA")],
        base_by_player={1: 100.0},
        last_price_by_player={1: 100.0},
        rating_by_player={1: 7.4},
    )
    assert ticks == [SettlementTick(player_id=1, price=60.0, rating=7.4)]


# --- qualification (Step 2) ----------------------------------------------


def test_qualified_team_ids_are_the_knockout_participants() -> None:
    # Provider truth: whoever appears in a knockout fixture has qualified —
    # format-agnostic (no top-2 / best-third reimplementation).
    assert qualified_team_ids([("FRA", "ARG"), ("BRA", "ESP")]) == {"FRA", "ARG", "BRA", "ESP"}
    assert qualified_team_ids([]) == set()


def test_qualification_pays_plus_5pct_to_qualified_squads_only() -> None:
    roster = [(1, "FRA"), (2, "FRA"), (10, "ARG")]
    ticks = plan_qualification(
        qualified={"FRA"},  # ARG did not reach the knockout
        roster=roster,
        base_by_player={1: 100.0, 2: 100.0, 10: 50.0},
        last_price_by_player={1: 120.0, 2: 100.0, 10: 80.0},
        rating_by_player={},
    )
    by_player = {t.player_id: t for t in ticks}
    assert set(by_player) == {1, 2}  # ARG (not qualified) untouched
    assert by_player[1].price == 126.00  # +5% of 120
    assert by_player[2].price == 105.00  # +5% of 100


def test_qualification_skips_unseeded_and_uses_base_when_no_tick() -> None:
    ticks = plan_qualification(
        qualified={"FRA"},
        roster=[(1, "FRA"), (2, "FRA")],
        base_by_player={1: 100.0, 2: None},  # #2 un-seeded
        last_price_by_player={},  # neither has a prior tick → base is current
        rating_by_player={},
    )
    assert [t.player_id for t in ticks] == [1]
    assert ticks[0].price == 105.00  # +5% of base 100


# --- suspension (Step 3) -------------------------------------------------


def test_red_and_second_yellow_are_straight_bans() -> None:
    suspended = newly_suspended_players(
        cards_in_fixture=[(1, "red_card"), (2, "yellow_red_card"), (3, "yellow_card")],
        cumulative_yellows={3: 1},  # single yellow, no accumulation
    )
    assert suspended == {1, 2}  # #3 only on one yellow → not banned


def test_two_yellow_accumulation_bans_recurring_at_even_totals() -> None:
    # A yellow in THIS match that brings the cumulative total to 2/4/… bans.
    assert newly_suspended_players(
        cards_in_fixture=[(1, "yellow_card")], cumulative_yellows={1: 2}
    ) == {1}
    assert newly_suspended_players(
        cards_in_fixture=[(1, "yellow_card")], cumulative_yellows={1: 3}
    ) == set()
    assert newly_suspended_players(
        cards_in_fixture=[(1, "yellow_card")], cumulative_yellows={1: 4}
    ) == {1}


def test_accumulation_only_counts_when_the_yellow_is_in_this_fixture() -> None:
    # No card in this fixture → no new ban even if the total is even.
    assert newly_suspended_players(cards_in_fixture=[], cumulative_yellows={1: 2}) == set()


def test_suspension_applies_minus_15pct_of_current_price() -> None:
    ticks = plan_flat_impact(
        player_ids=[1],
        base_by_player={1: 100.0},
        last_price_by_player={1: 120.0},
        rating_by_player={1: 7.0},
        impact_frac=-0.15,
    )
    assert ticks == [SettlementTick(player_id=1, price=102.0, rating=7.0)]  # 120 * 0.85


# --- lineup drop (Step 4) ------------------------------------------------


def test_dropped_starters_are_last_match_starters_no_longer_in_the_xi() -> None:
    # 7, 9 started last match; this match's XI keeps 7 but drops 9 (and adds 12).
    assert dropped_starters(previous_starters={7, 9}, current_starters={7, 12}) == {9}


def test_no_previous_match_means_no_drops() -> None:
    # Tournament opener: no expectation formed yet.
    assert dropped_starters(previous_starters=set(), current_starters={1, 2, 3}) == set()


def test_unchanged_xi_drops_nobody() -> None:
    assert dropped_starters(previous_starters={1, 2}, current_starters={1, 2, 3}) == set()


# --- did-not-play (escalating -1% x tally) -------------------------------


def test_did_not_play_penalty_scales_with_zero_minute_tally() -> None:
    # player 1: 1st zero-minute match -> -1% (x0.99); player 2: his 3rd ->
    # -3% (x0.97). The escalation is just impact = -0.01 * tally per player.
    ticks = plan_impacts(
        impacts_by_player={1: -0.01 * 1, 2: -0.01 * 3},
        base_by_player={1: 100.0, 2: 100.0},
        last_price_by_player={1: 100.0, 2: 100.0},
        rating_by_player={},
    )
    by_player = {t.player_id: t for t in ticks}
    assert by_player[1].price == 99.00  # 100 * (1 - 0.01)
    assert by_player[2].price == 97.00  # 100 * (1 - 0.03)


def test_zero_impact_player_gets_no_tick() -> None:
    # A featured player (tally 0 → impact 0) is never penalised.
    assert plan_impacts(
        impacts_by_player={1: 0.0},
        base_by_player={1: 100.0},
        last_price_by_player={1: 100.0},
        rating_by_player={},
    ) == []
