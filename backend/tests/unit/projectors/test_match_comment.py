"""Unit tests for project_match_comment — focus on is_goal derivation.

The provider `is_goal` boolean is deliberately ignored (unreliable in
both directions, see analysis/comment-is-goal.md); is_goal is re-derived
from the commentary text. Cases are taken verbatim from the WC2022
archive.
"""

import pytest

from src.domain.match.match_comment import MatchComment
from src.infrastructure.sportmonks.projectors.match_comment import (
    comment_names_scorer,
    is_goal_comment,
    is_goal_overturn_comment,
    overturn_scorer_name,
    overturned_goal_ids,
    project_match_comment,
)


def _comment(id_: int, text: str, *, is_goal: bool, sequence: int) -> MatchComment:
    return MatchComment(
        id=id_,
        fixture_id=1,
        minute=sequence,
        extra_minute=None,
        comment=text,
        is_goal=is_goal,
        is_important=False,
        sequence=sequence,
    )


# Real lines from the WC2022 archive (Argentina-Saudi 18493996, Germany-Japan
# 18494001, Brazil-Switzerland 18494081, Spain-Germany 18494073).
_GOAL_LAUTARO = "Goal!  Argentina 2, Saudi Arabia 0. Lautaro Martínez  - Argentina -  shot with right foot."
_OVERTURN_LAUTARO = (
    "GOAL OVERTURNED BY VAR: Lautaro Martínez  - Argentina -  scores but the goal is ruled out after a VAR review."
)
_GOAL_MESSI = "Goal!  Argentina 1, Saudi Arabia 0. Lionel Messi  - Argentina -  converts the penalty."

# Real lines from the ARG-FRA final + edge cases observed in the data.
GOAL_LINES = [
    "Goal!  Argentina 1, France 0. Lionel Messi  - Argentina -  converts the penalty.",
    "Goal! Argentina takes the lead 3-2 against France as Paulo Dybala steps up.",
    "Own Goal by Nayef Aguerd, Morocco.  Canada 1, Morocco 2.",
    "  goal!  lowercased and indented still counts",
]
NOT_GOAL_LINES = [
    "Olivier Giroud  - France -  won a free kick in attack.",
    "Fouled by Jules Koundé  - France",
    "Gonzalo Montiel  - Argentina -  receive yellow card for hand ball.",
    "GOAL OVERTURNED BY VAR: Lautaro Martínez  - Argentina -  scored.",
    "Goalkeeper saves the shot in the centre of the goal.",
    "Goal Kick for France.",
    "",
]


@pytest.mark.parametrize("text", GOAL_LINES)
def test_is_goal_comment_true(text: str) -> None:
    assert is_goal_comment(text) is True


@pytest.mark.parametrize("text", NOT_GOAL_LINES)
def test_is_goal_comment_false(text: str) -> None:
    assert is_goal_comment(text) is False


def test_projector_ignores_unreliable_provider_flag() -> None:
    """provider is_goal=True on a non-goal line must NOT make it a goal;
    provider is_goal=False on a real goal line must NOT suppress it."""
    false_positive = {
        "id": 1,
        "comment": "Olivier Giroud  - France -  won a free kick in attack.",
        "minute": 23,
        "extra_minute": None,
        "is_goal": True,  # provider says goal — it is not
        "is_important": True,
        "order": 1,
    }
    false_negative = {
        "id": 2,
        "comment": "Goal!  Argentina 1, France 0. Lionel Messi converts the penalty.",
        "minute": 21,
        "extra_minute": None,
        "is_goal": False,  # provider says not-goal — it is a goal
        "is_important": False,
        "order": 2,
    }
    c1, _ = project_match_comment(false_positive, fixture_id=65)
    c2, _ = project_match_comment(false_negative, fixture_id=65)
    assert c1.is_goal is False
    assert c2.is_goal is True


def test_overturn_detection_and_scorer_extraction() -> None:
    assert is_goal_overturn_comment(_OVERTURN_LAUTARO) is True
    assert is_goal_overturn_comment(_GOAL_LAUTARO) is False
    assert overturn_scorer_name(_OVERTURN_LAUTARO) == "Lautaro Martínez"
    assert overturn_scorer_name(_GOAL_LAUTARO) is None


def test_overturned_goal_is_cancelled() -> None:
    """The Goal! line keeps is_goal=True; the overturn sibling cancels it."""
    comments = [
        _comment(10, _GOAL_LAUTARO, is_goal=True, sequence=22),
        _comment(11, _OVERTURN_LAUTARO, is_goal=False, sequence=23),
    ]
    assert overturned_goal_ids(comments) == {10}


def test_overturn_without_preceding_goal_cancels_nothing() -> None:
    """Observed in the data (Spain-Germany 39'): an overturn line with no
    matching Goal! line must not cancel anything."""
    comments = [
        _comment(20, "Serge Gnabry  - Germany -  won a free kick on the right wing.", is_goal=False, sequence=40),
        _comment(21, _OVERTURN_LAUTARO, is_goal=False, sequence=41),
        _comment(22, _OVERTURN_LAUTARO, is_goal=False, sequence=42),  # duplicated line
    ]
    assert overturned_goal_ids(comments) == set()


def test_earlier_valid_goal_survives_later_disallowed_one() -> None:
    """A player's valid goal must stay a goal when a LATER goal of his is
    disallowed — the overturn cancels the most recent matching goal only."""
    valid = "Goal!  Argentina 1, Saudi Arabia 0. Lautaro Martínez  - Argentina -  tap in."
    disallowed = "Goal!  Argentina 2, Saudi Arabia 0. Lautaro Martínez  - Argentina -  header."
    comments = [
        _comment(1, valid, is_goal=True, sequence=10),
        _comment(2, disallowed, is_goal=True, sequence=22),
        _comment(3, _OVERTURN_LAUTARO, is_goal=False, sequence=23),
    ]
    assert overturned_goal_ids(comments) == {2}


def test_other_players_goal_is_not_cancelled() -> None:
    comments = [
        _comment(1, _GOAL_MESSI, is_goal=True, sequence=10),
        _comment(2, _GOAL_LAUTARO, is_goal=True, sequence=22),
        _comment(3, _OVERTURN_LAUTARO, is_goal=False, sequence=23),
    ]
    assert overturned_goal_ids(comments) == {2}


# --- comment_names_scorer: bridges the accent mismatch between the VAR event
# (player_name 'Tomáš Souček') and the WC2026 commentary ('Tomas Soucek'). ---
def test_comment_names_scorer_matches_across_accents() -> None:
    comment = "Goal! Tomas Soucek scores to make it 1-2, assisted by Michal Sadilek."
    assert comment_names_scorer(comment, "Tomáš Souček") is True


def test_comment_names_scorer_rejects_other_player() -> None:
    comment = "Goal! Tomas Soucek scores to make it 1-2, assisted by Michal Sadilek."
    assert comment_names_scorer(comment, "Lionel Messi") is False


def test_comment_names_scorer_rejects_too_short_surname() -> None:
    """A 2-char surname would over-match as a substring, so it is rejected."""
    assert comment_names_scorer("Goal! the goalkeeper is exit-bound.", "Player Xi") is False
