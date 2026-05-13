"""Unit tests for project_lineup using real Sportmonks shapes."""

import pytest

from src.domain.match.lineup import LineupRole
from src.infrastructure.sportmonks.projectors.lineup import project_lineup


def _resolvers() -> tuple[dict[int, int], dict[int, str]]:
    """Toy resolvers (sportmonks → internal). Real ones come from DB lookups."""
    players = {188444: 42, 96611: 99, 211190: 1}
    teams = {18644: "ARG", 18647: "FRA"}
    return players, teams


def test_starter_lineup_with_position_include() -> None:
    payload = {
        "id": 985975983,
        "fixture_id": 18452325,
        "player_id": 188444,
        "team_id": 18644,
        "position_id": 25,
        "type_id": 11,
        "formation_position": 5,
        "jersey_number": 3,
        "formation_field": "2:3",
        "position": {"id": 25, "name": "Defender", "code": "defender"},
    }
    p, t = _resolvers()
    lineup, smk = project_lineup(payload, fixture_id=65, player_id_by_sportmonks=p, team_id_by_sportmonks=t)
    assert smk == 985975983
    assert lineup.fixture_id == 65
    assert lineup.player_id == 42
    assert lineup.team_id == "ARG"
    assert lineup.role is LineupRole.STARTER
    assert lineup.position == "DF"
    assert lineup.jersey_number == 3
    assert lineup.formation_position == 5
    assert lineup.formation_field == "2:3"


def test_bench_lineup_no_formation_position() -> None:
    payload = {
        "id": 985975971,
        "player_id": 211190,
        "team_id": 18644,
        "position_id": 24,
        "type_id": 12,
        "formation_position": None,
        "formation_field": None,
        "jersey_number": 1,
    }
    p, t = _resolvers()
    lineup, _ = project_lineup(payload, fixture_id=65, player_id_by_sportmonks=p, team_id_by_sportmonks=t)
    assert lineup.role is LineupRole.BENCH
    assert lineup.formation_position is None
    assert lineup.formation_field is None
    assert lineup.position == "GK"


def test_unknown_player_raises() -> None:
    payload = {
        "id": 999,
        "player_id": 1234567,
        "team_id": 18644,
        "type_id": 11,
        "position_id": 26,
    }
    p, t = _resolvers()
    with pytest.raises(ValueError, match="unknown player"):
        project_lineup(payload, fixture_id=65, player_id_by_sportmonks=p, team_id_by_sportmonks=t)


def test_unknown_team_raises() -> None:
    payload = {
        "id": 999,
        "player_id": 188444,
        "team_id": 99999,
        "type_id": 11,
        "position_id": 26,
    }
    p, t = _resolvers()
    with pytest.raises(ValueError, match="unknown team"):
        project_lineup(payload, fixture_id=65, player_id_by_sportmonks=p, team_id_by_sportmonks=t)


def test_unknown_type_id_raises() -> None:
    """Coaches/managers come through with type_id=29 etc — not a player role."""
    payload = {
        "id": 999,
        "player_id": 188444,
        "team_id": 18644,
        "type_id": 29,
        "position_id": 26,
    }
    p, t = _resolvers()
    with pytest.raises(ValueError, match="not a player role"):
        project_lineup(payload, fixture_id=65, player_id_by_sportmonks=p, team_id_by_sportmonks=t)
