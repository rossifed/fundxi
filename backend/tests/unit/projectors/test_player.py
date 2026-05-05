"""Unit tests for project_player."""

from datetime import date

import pytest

from src.domain.player.player import Position
from src.infrastructure.sportmonks.projectors.player import project_player

_BASE_PAYLOAD = {
    "id": 1234,
    "common_name": "Vinicius Jr",
    "display_name": "Vinicius Jr",
    "firstname": "Vinicius",
    "lastname": "Junior",
    "name": "Vinicius Jose Paixao de Oliveira Junior",
    "date_of_birth": "2000-07-12",
    "height": 176,
    "weight": 73,
    "position": {"id": 27, "name": "Attacker"},
}


def test_project_player_minimal() -> None:
    player, sportmonks_id = project_player(
        _BASE_PAYLOAD,
        team_id="BRA",
        jersey_number=7,
        today=date(2026, 6, 12),
    )
    assert sportmonks_id == 1234
    assert player.id == 0
    assert player.name == "Vinicius Jr"
    assert player.full_name == "Vinicius Jose Paixao de Oliveira Junior"
    assert player.team_id == "BRA"
    assert player.jersey_number == 7
    assert player.position is Position.FORWARD
    assert player.height == 176
    assert player.weight == 73


def test_project_player_age_before_birthday() -> None:
    player, _ = project_player(
        _BASE_PAYLOAD,
        team_id="BRA",
        jersey_number=7,
        today=date(2026, 6, 12),  # before 2026-07-12
    )
    assert player.age == 25


def test_project_player_age_after_birthday() -> None:
    player, _ = project_player(
        _BASE_PAYLOAD,
        team_id="BRA",
        jersey_number=7,
        today=date(2026, 7, 13),
    )
    assert player.age == 26


def test_project_player_missing_dob_yields_no_age() -> None:
    payload = {**_BASE_PAYLOAD}
    payload.pop("date_of_birth")
    player, _ = project_player(payload, team_id="BRA", jersey_number=7, today=date(2026, 6, 12))
    assert player.age is None


def test_project_player_missing_position_raises() -> None:
    payload = {**_BASE_PAYLOAD}
    payload.pop("position")
    with pytest.raises(ValueError, match="position"):
        project_player(payload, team_id="BRA", jersey_number=7, today=date(2026, 6, 12))


def test_project_player_uses_common_name_when_display_missing() -> None:
    payload = {**_BASE_PAYLOAD}
    payload.pop("display_name")
    player, _ = project_player(payload, team_id="BRA", jersey_number=7, today=date(2026, 6, 12))
    assert player.name == "Vinicius Jr"


def test_project_player_invalid_dob_yields_no_age() -> None:
    payload = {**_BASE_PAYLOAD, "date_of_birth": "not-a-date"}
    player, _ = project_player(payload, team_id="BRA", jersey_number=7, today=date(2026, 6, 12))
    assert player.age is None
