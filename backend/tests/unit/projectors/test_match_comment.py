"""Unit tests for project_match_comment — focus on is_goal derivation.

The provider `is_goal` boolean is deliberately ignored (unreliable in
both directions, see analysis/comment-is-goal.md); is_goal is re-derived
from the commentary text. Cases are taken verbatim from the WC2022
archive.
"""

import pytest

from src.infrastructure.sportmonks.projectors.match_comment import (
    is_goal_comment,
    project_match_comment,
)

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
