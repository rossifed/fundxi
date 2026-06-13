"""Tests for the stats→kernel adapter (the single live/replay bridge)."""

import pytest

from src.domain.match.player_match_stat import PlayerMatchStat
from src.valuation.pricing import price, price_from_carried, tournament_delta_from
from src.valuation.snapshot import build_snapshot


def _stat(**kw: object) -> PlayerMatchStat:
    return PlayerMatchStat(player_id=1, fixture_id=10, **kw)  # type: ignore[arg-type]


def test_build_snapshot_passes_real_rating_through() -> None:
    snap = build_snapshot(_stat(rating=7.4), None, pressure_factor=None, is_live=True)
    assert snap.rating == 7.4
    assert snap.is_live is True
    # no prev → prev stats are all zero (no spurious negative diff)
    assert snap.prev_stats.shots_total == 0


def test_build_snapshot_maps_stat_increment() -> None:
    prev = _stat(shots_on_target=1, key_passes=2)
    curr = _stat(shots_on_target=3, key_passes=5, rating=6.5)
    snap = build_snapshot(curr, prev, pressure_factor=1.0, is_live=True)
    assert snap.curr_stats.shots_on_target == 3
    assert snap.prev_stats.shots_on_target == 1
    # neutral rating + a positive stat increment ⇒ small positive move
    assert price(50.0, 0.0, snap).price > 50.0


def test_build_snapshot_feeds_xg_to_the_kernel() -> None:
    # A +0.50 xG increment at a neutral rating must move the price up via the
    # Layer-2 term (w_xg_per_0_1_pct), proving xG now reaches the kernel.
    prev = _stat(xg=0.10, rating=6.5)
    curr = _stat(xg=0.60, rating=6.5)
    snap = build_snapshot(curr, prev, pressure_factor=1.0, is_live=True)
    assert snap.curr_stats.xg == 0.60
    assert snap.prev_stats.xg == 0.10
    assert price(50.0, 0.0, snap).price > 50.0


def test_absent_xg_degrades_without_fabrication() -> None:
    # No xG on either poll ⇒ xg stays 0.0 (degrades to shots/key-passes),
    # and with no other stat increment the neutral-rating price is unchanged.
    snap = build_snapshot(_stat(rating=6.5), _stat(rating=6.5), pressure_factor=1.0, is_live=True)
    assert snap.curr_stats.xg == 0.0
    assert price(50.0, 0.0, snap).price == pytest.approx(50.0, abs=0.01)


def test_missing_rating_is_neutral_not_a_crash() -> None:
    snap = build_snapshot(_stat(rating=None), None, pressure_factor=None, is_live=True)
    assert price(50.0, 0.0, snap).price == pytest.approx(50.0, abs=0.01)


@pytest.mark.parametrize(
    ("last_price", "base", "expected"),
    [(None, 50.0, 0.0), (55.0, 50.0, 0.10), (45.0, 50.0, -0.10), (50.0, 0.0, 0.0)],
)
def test_tournament_delta_from(last_price: float | None, base: float, expected: float) -> None:
    assert tournament_delta_from(last_price, base) == pytest.approx(expected)


def test_balance_plus_live_compose_coherently() -> None:
    # banked +10% from past matches, now playing well live
    td = tournament_delta_from(55.0, 50.0)
    snap = build_snapshot(_stat(rating=8.0), None, pressure_factor=None, is_live=True)
    r = price(50.0, td, snap)
    assert r.tournament_delta == pytest.approx(0.10)
    assert r.price == pytest.approx(round(50.0 * (1.0 + 0.10 + r.live_delta), 2))
    assert r.price > 55.0  # live good play adds on top of the banked balance


def test_price_from_carried_matches_manual_composition() -> None:
    """The shared entry point both ingestion paths use must equal the
    explicit ``tournament_delta_from`` + ``price`` composition."""
    snap = build_snapshot(_stat(rating=7.2), None, pressure_factor=None, is_live=True)
    via_helper = price_from_carried(50.0, 55.0, snap)
    manual = price(50.0, tournament_delta_from(55.0, 50.0), snap)
    assert via_helper == manual


def test_price_from_carried_none_means_no_banked_balance() -> None:
    """No carried-in price (tournament start / fresh rehearsal) ⇒ the
    persistent component is 0 and only the live snapshot moves the price."""
    snap = build_snapshot(_stat(rating=6.5), None, pressure_factor=None, is_live=True)
    r = price_from_carried(50.0, None, snap)
    assert r.tournament_delta == 0.0
    assert r.price == pytest.approx(50.0, abs=0.01)
