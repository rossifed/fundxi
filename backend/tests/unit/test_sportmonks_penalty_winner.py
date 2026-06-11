"""Unit tests for ``penalty_shootout_winner`` — the knockout-on-penalties signal.

Payload shape verified against a real FT_PEN fixture in our raw archive: the
``scores`` array carries a ``PENALTY_SHOOTOUT`` block per participant alongside
the level ``CURRENT`` (regulation + ET) blocks.
"""

from src.infrastructure.sportmonks.projectors.fixture import _final_score, penalty_shootout_winner

# A real-shaped scores array: 3-3 after ET (CURRENT level), home wins the
# shootout 4-2.
_SCORES = [
    {"description": "CURRENT", "type_id": 1525, "score": {"participant": "home", "goals": 3}},
    {"description": "CURRENT", "type_id": 1525, "score": {"participant": "away", "goals": 3}},
    {"description": "PENALTY_SHOOTOUT", "type_id": 5, "score": {"participant": "home", "goals": 4}},
    {"description": "PENALTY_SHOOTOUT", "type_id": 5, "score": {"participant": "away", "goals": 2}},
]


def test_shootout_winner_is_the_side_with_more_converted_penalties() -> None:
    assert penalty_shootout_winner(_SCORES) == "home"


def test_current_score_excludes_the_shootout() -> None:
    # The level full-time score must stay 3-3 — the shootout is a separate block.
    assert _final_score(_SCORES, "home") == 3
    assert _final_score(_SCORES, "away") == 3


def test_away_shootout_win() -> None:
    scores = [
        {"description": "PENALTY_SHOOTOUT", "score": {"participant": "home", "goals": 2}},
        {"description": "PENALTY_SHOOTOUT", "score": {"participant": "away", "goals": 4}},
    ]
    assert penalty_shootout_winner(scores) == "away"


def test_no_shootout_block_returns_none() -> None:
    scores = [{"description": "CURRENT", "score": {"participant": "home", "goals": 2}}]
    assert penalty_shootout_winner(scores) is None


def test_malformed_payload_returns_none() -> None:
    assert penalty_shootout_winner(None) is None
    assert penalty_shootout_winner([]) is None
    assert penalty_shootout_winner("nonsense") is None
