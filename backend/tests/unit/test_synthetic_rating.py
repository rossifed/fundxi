"""Tests for the synthetic rating walk (rehearsal generator, pure)."""

from random import Random

import pytest

from src.simulation.domain.synthetic_rating import (
    DEFAULT_WALK,
    event_bump,
    next_rating,
)


def test_walk_stays_within_bounds_over_a_full_match() -> None:
    rng = Random(42)
    r = 6.0
    for _ in range(95):
        r = next_rating(r, rng=rng)
        assert DEFAULT_WALK.floor <= r <= DEFAULT_WALK.ceil


def test_deterministic_for_a_given_seed() -> None:
    a = Random(7)
    b = Random(7)
    ra = rb = 6.0
    for _ in range(20):
        ra = next_rating(ra, rng=a)
        rb = next_rating(rb, rng=b)
    assert ra == rb


def test_goal_bump_pushes_rating_up() -> None:
    # same seed, one path gets a goal bump → ends higher
    plain = Random(1)
    bumped = Random(1)
    rp = rb = 6.0
    rp = next_rating(rp, rng=plain)
    rb = next_rating(rb, rng=bumped, bump=DEFAULT_WALK.goal_bump)
    assert rb > rp


@pytest.mark.parametrize(
    ("etype", "sign"),
    [("goal", 1), ("penalty", 1), ("assist", 1), ("yellow_card", -1), ("red_card", -1), ("own_goal", -1)],
)
def test_event_bump_sign(etype: str, sign: int) -> None:
    assert (event_bump(etype) > 0) == (sign > 0)


def test_unknown_event_is_neutral() -> None:
    assert event_bump(None) == 0.0
    assert event_bump("substitution") == 0.0
