"""Unit tests for compound_per_match_changes — the per-fixture net-move
aggregation behind EngineValuationProvider's batched price resolution."""

from src.infrastructure.valuation.engine_valuation_provider import compound_per_match_changes


def test_empty_rows() -> None:
    assert compound_per_match_changes([]) == {}


def test_single_fixture_single_tick() -> None:
    # One +5% event -> net +5%; avg == last == 5.0.
    assert compound_per_match_changes([(1, 100, 5.0)]) == {1: (5.0, 5.0)}


def test_single_fixture_compounds_ticks() -> None:
    # +10% then -5% -> 1.10 * 0.95 = 1.045 -> net +4.5%.
    assert compound_per_match_changes([(1, 100, 10.0), (1, 100, -5.0)]) == {1: (4.5, 4.5)}


def test_two_fixtures_avg_and_last() -> None:
    # Fixture 100: +10%, fixture 200: +20% (later) -> avg 15, last 20.
    assert compound_per_match_changes([(1, 100, 10.0), (1, 200, 20.0)]) == {1: (15.0, 20.0)}


def test_last_is_most_recent_fixture_in_ts_order() -> None:
    # Rows arrive in ts order; the last fixture id seen is the most recent.
    # Fixture 200 net = 1.08 * 1.02 - 1 = 10.16%; avg of 4.0 and 10.16 = 7.08.
    result = compound_per_match_changes([(1, 100, 4.0), (1, 200, 8.0), (1, 200, 2.0)])
    assert result == {1: (7.08, 10.16)}


def test_multiple_players_isolated() -> None:
    assert compound_per_match_changes([(1, 100, 5.0), (2, 100, -3.0)]) == {
        1: (5.0, 5.0),
        2: (-3.0, -3.0),
    }


def test_none_fixture_id_skipped() -> None:
    assert compound_per_match_changes([(1, None, 99.0), (1, 100, 5.0)]) == {1: (5.0, 5.0)}
