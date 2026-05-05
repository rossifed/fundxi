"""Unit tests for project_team — Sportmonks team payload → domain Team."""

import pytest

from src.domain.team.team import Team, TeamKind
from src.infrastructure.sportmonks.projectors.team import project_team


def test_project_team_minimal_national() -> None:
    payload = {
        "id": 17,
        "name": "Brazil",
        "short_code": "BRA",
        "image_path": "https://cdn.sportmonks.com/images/teams/brazil.png",
        "type": "national",
    }
    team, sportmonks_id = project_team(payload)
    assert sportmonks_id == 17
    assert team == Team(
        id="BRA",
        name="Brazil",
        flag="https://cdn.sportmonks.com/images/teams/brazil.png",
        color="",
        kind=TeamKind.NATIONAL,
        confederation=None,
        group=None,
    )


def test_project_team_uppercases_short_code() -> None:
    payload = {"id": 18, "name": "France", "short_code": "fra", "type": "national"}
    team, _ = project_team(payload)
    assert team.id == "FRA"


def test_project_team_missing_short_code_raises() -> None:
    payload = {"id": 19, "name": "NoCode", "type": "national"}
    with pytest.raises(ValueError, match="short_code"):
        project_team(payload)


def test_project_team_missing_name_raises() -> None:
    payload = {"id": 20, "short_code": "XXX", "type": "national"}
    with pytest.raises(ValueError, match="name"):
        project_team(payload)


def test_project_team_non_int_id_raises() -> None:
    payload = {"id": "17", "name": "Brazil", "short_code": "BRA", "type": "national"}
    with pytest.raises(TypeError, match=r"team\.id must be int"):
        project_team(payload)


def test_project_team_unknown_type_falls_back_to_national() -> None:
    payload = {"id": 21, "name": "X", "short_code": "XYZ", "type": "weird"}
    team, _ = project_team(payload)
    assert team.kind is TeamKind.NATIONAL


def test_project_team_domestic_kind() -> None:
    payload = {"id": 22, "name": "PSG", "short_code": "PSG", "type": "domestic"}
    team, _ = project_team(payload)
    assert team.kind is TeamKind.CLUB


def test_project_team_no_image_path_yields_empty_flag() -> None:
    payload = {"id": 23, "name": "Iceland", "short_code": "ISL", "type": "national"}
    team, _ = project_team(payload)
    assert team.flag == ""
