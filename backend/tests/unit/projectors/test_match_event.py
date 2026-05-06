"""Unit tests for project_match_event."""

from src.domain.match.match_event import MatchEventType
from src.infrastructure.sportmonks.projectors.match_event import project_match_event


def _resolvers() -> tuple[dict[int, int], dict[int, str]]:
    players = {96611: 999, 188444: 42, 211190: 1}
    teams = {18644: "ARG", 18647: "FRA"}
    return players, teams


def _mbappe_penalty() -> dict[str, object]:
    return {
        "id": 71149755,
        "fixture_id": 18452325,
        "participant_id": 18647,
        "type_id": 16,
        "player_id": 96611,
        "related_player_id": None,
        "minute": 80,
        "extra_minute": None,
        "info": "Penalty",
        "sort_order": 3,
        "type": {"id": 16, "name": "Penalty", "code": "penalty"},
    }


def test_penalty_event_resolves_player_and_team() -> None:
    p, t = _resolvers()
    ev, smk = project_match_event(_mbappe_penalty(), fixture_id=65, player_id_by_sportmonks=p, team_id_by_sportmonks=t)
    assert smk == 71149755
    assert ev.fixture_id == 65
    assert ev.minute == 80
    assert ev.type is MatchEventType.PENALTY
    assert ev.player_id == 999
    assert ev.team_id == "FRA"
    assert ev.info == "Penalty"
    assert ev.sequence == 3


def test_unknown_type_falls_back_to_other() -> None:
    p, t = _resolvers()
    payload = {**_mbappe_penalty(), "type": {"code": "weird-future-event"}}
    ev, _ = project_match_event(payload, fixture_id=65, player_id_by_sportmonks=p, team_id_by_sportmonks=t)
    assert ev.type is MatchEventType.OTHER


def test_unknown_player_id_yields_none() -> None:
    p, t = _resolvers()
    payload = {**_mbappe_penalty(), "player_id": 1234567}
    ev, _ = project_match_event(payload, fixture_id=65, player_id_by_sportmonks=p, team_id_by_sportmonks=t)
    assert ev.player_id is None  # silently dropped — event still useful


def test_substitution_with_related_player() -> None:
    p, t = _resolvers()
    payload = {
        "id": 1,
        "fixture_id": 18452325,
        "participant_id": 18644,
        "player_id": 188444,
        "related_player_id": 211190,
        "minute": 64,
        "type_id": 18,
        "sort_order": 22,
        "type": {"code": "substitution", "name": "Substitution"},
    }
    ev, _ = project_match_event(payload, fixture_id=65, player_id_by_sportmonks=p, team_id_by_sportmonks=t)
    assert ev.type is MatchEventType.SUBSTITUTION
    assert ev.player_id == 42
    assert ev.related_player_id == 1


def test_yellow_card_kebab_normalisation() -> None:
    p, t = _resolvers()
    payload = {
        "id": 2,
        "fixture_id": 18452325,
        "participant_id": 18644,
        "player_id": 188444,
        "minute": 36,
        "type_id": 19,
        "sort_order": 18,
        "type": {"code": "yellowcard"},
    }
    ev, _ = project_match_event(payload, fixture_id=65, player_id_by_sportmonks=p, team_id_by_sportmonks=t)
    assert ev.type is MatchEventType.YELLOW_CARD


def test_missing_minute_raises() -> None:
    p, t = _resolvers()
    payload = {**_mbappe_penalty(), "minute": None}
    import pytest

    with pytest.raises(ValueError, match="minute"):
        project_match_event(payload, fixture_id=65, player_id_by_sportmonks=p, team_id_by_sportmonks=t)
