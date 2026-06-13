"""Unit tests for the /api/fixtures match-event DTO mapping (_event_dto).

Focus: own goals must be flagged (`is_own_goal`) and labelled distinctly while
keeping the ⚽ glyph, so the frontend can render them apart from normal goals
without crediting the scorer with a goal for his own team.
"""

from src.api.routers.fixtures import _event_dto
from src.domain.match.match_event import MatchEvent, MatchEventType

_PLAYER_NAMES = {1214: "Damián Bobadilla", 546: "Folarin Balogun", 558: "Christian Pulisic"}


def _event(event_type: MatchEventType, *, player_id: int, related_player_id: int | None = None) -> MatchEvent:
    return MatchEvent(
        id=1,
        fixture_id=7,
        minute=7,
        extra_minute=None,
        type=event_type,
        player_id=player_id,
        related_player_id=related_player_id,
        # team_id is the BENEFITING team for an own goal — already normalised
        # upstream; the scorer plays for the other team.
        team_id="USA",
        info="Right foot shot",
        sequence=1,
    )


def test_own_goal_is_flagged_keeps_glyph_and_labels_distinctly() -> None:
    dto = _event_dto(_event(MatchEventType.OWN_GOAL, player_id=1214), _PLAYER_NAMES)
    assert dto.is_own_goal is True
    assert dto.type == "⚽"  # still a goal in the feed
    assert dto.headline == "Own goal: Damián Bobadilla"
    assert dto.player_name == "Damián Bobadilla"


def test_normal_goal_is_not_flagged() -> None:
    dto = _event_dto(_event(MatchEventType.GOAL, player_id=546, related_player_id=558), _PLAYER_NAMES)
    assert dto.is_own_goal is False
    assert dto.type == "⚽"
    assert dto.headline == "Goal: Folarin Balogun (assist Christian Pulisic)"
