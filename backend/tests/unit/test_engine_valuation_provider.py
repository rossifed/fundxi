"""Unit tests for per_match_changes_from_prices — the per-fixture net-move
aggregation behind EngineValuationProvider, derived from prices (not deltas)."""

from src.infrastructure.valuation.engine_valuation_provider import per_match_changes_from_prices


def test_empty_rows() -> None:
    assert per_match_changes_from_prices([], base_by_player={}) == {}


def test_single_fixture_uses_base_as_pre() -> None:
    # Base 100, one fixtured tick at 105 → net (105/100 - 1) = +5%.
    assert per_match_changes_from_prices([(1, 100, 105.0)], base_by_player={1: 100.0}) == {1: (5.0, 5.0)}


def test_single_fixture_multiple_ticks_pre_is_base_post_is_last() -> None:
    # Base 100; ticks 110 then 104 in the same fixture → pre 100, post 104 → +4%.
    rows = [(1, 100, 110.0), (1, 100, 104.0)]
    assert per_match_changes_from_prices(rows, base_by_player={1: 100.0}) == {1: (4.0, 4.0)}


def test_two_fixtures_pre_carries_previous_close() -> None:
    # Base 100; fixture 100 closes at 110 (+10%); fixture 200 pre = 110, post
    # 132 → +20%. avg 15, last 20.
    rows = [(1, 100, 110.0), (1, 200, 132.0)]
    assert per_match_changes_from_prices(rows, base_by_player={1: 100.0}) == {1: (15.0, 20.0)}


def test_last_is_most_recent_fixture_in_order() -> None:
    # Base 100; fixture 100 → 108 (+8%); fixture 200 ticks 108→118.8 (+10%).
    rows = [(1, 100, 108.0), (1, 200, 113.0), (1, 200, 118.8)]
    result = per_match_changes_from_prices(rows, base_by_player={1: 100.0})
    assert result == {1: (9.0, 10.0)}  # avg (8 + 10)/2 = 9, last = 10


def test_multiple_players_isolated_each_with_own_base() -> None:
    rows = [(1, 100, 105.0), (2, 100, 97.0)]
    assert per_match_changes_from_prices(rows, base_by_player={1: 100.0, 2: 100.0}) == {
        1: (5.0, 5.0),
        2: (-3.0, -3.0),
    }


def test_player_with_no_fixtured_tick_is_absent() -> None:
    # Only player 1 has a fixtured tick; player 2 (base only) is absent.
    assert per_match_changes_from_prices([(1, 100, 105.0)], base_by_player={1: 100.0, 2: 50.0}) == {1: (5.0, 5.0)}


def test_missing_base_falls_back_to_first_tick_price() -> None:
    # No base for player 1 → pre defaults to the first fixtured tick's price, so
    # that first tick contributes 0% and only later moves count.
    rows = [(1, 100, 100.0), (1, 100, 110.0)]
    assert per_match_changes_from_prices(rows, base_by_player={}) == {1: (10.0, 10.0)}
