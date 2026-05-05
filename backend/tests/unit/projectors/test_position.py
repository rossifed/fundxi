"""Unit tests for the position projector."""

import pytest

from src.domain.player.player import Position
from src.infrastructure.sportmonks.projectors._position import project_position


def test_project_position_by_id() -> None:
    assert project_position({"id": 24, "name": "Goalkeeper"}) is Position.GOALKEEPER
    assert project_position({"id": 25, "name": "Defender"}) is Position.DEFENDER
    assert project_position({"id": 26, "name": "Midfielder"}) is Position.MIDFIELDER
    assert project_position({"id": 27, "name": "Attacker"}) is Position.FORWARD


def test_project_position_unknown_id_falls_back_to_name() -> None:
    assert project_position({"id": 999, "name": "Centre Back"}) is Position.DEFENDER
    assert project_position({"id": 999, "name": "Right Winger"}) is Position.FORWARD
    assert project_position({"id": 999, "name": "Defensive Midfielder"}) is Position.MIDFIELDER


def test_project_position_name_only() -> None:
    assert project_position({"name": "Goalkeeper"}) is Position.GOALKEEPER
    assert project_position({"name": "Striker"}) is Position.FORWARD


def test_project_position_unrecognised_name_raises() -> None:
    with pytest.raises(ValueError, match="Unrecognised"):
        project_position({"name": "Coach"})


def test_project_position_non_dict_raises() -> None:
    with pytest.raises(TypeError, match="dict"):
        project_position("Goalkeeper")  # type: ignore[arg-type]
