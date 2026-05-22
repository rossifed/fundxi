"""Unit tests for project_coach — Sportmonks coach payload → CoachProjection."""

from src.infrastructure.sportmonks.projectors.coach import CoachProjection, project_coach


def test_project_coach_full_payload() -> None:
    payload = {
        "id": 455,
        "name": "Didier Deschamps",
        "image_path": "https://cdn.sportmonks.com/images/coaches/455.png",
        "country": {"name": "France", "iso2": "FR"},
    }
    assert project_coach(payload) == CoachProjection(
        sportmonks_id=455,
        name="Didier Deschamps",
        image_path="https://cdn.sportmonks.com/images/coaches/455.png",
        nationality_name="France",
        nationality_iso="FR",
    )


def test_project_coach_minimal_payload() -> None:
    projection = project_coach({"id": 1, "name": "Coach X"})
    assert projection == CoachProjection(
        sportmonks_id=1,
        name="Coach X",
        image_path=None,
        nationality_name=None,
        nationality_iso=None,
    )


def test_project_coach_name_falls_back_to_display_name() -> None:
    projection = project_coach({"id": 2, "display_name": "L. Scaloni"})
    assert projection is not None
    assert projection.name == "L. Scaloni"


def test_project_coach_non_dict_returns_none() -> None:
    assert project_coach(None) is None
    assert project_coach([{"id": 1, "name": "X"}]) is None


def test_project_coach_missing_id_returns_none() -> None:
    assert project_coach({"name": "No Id"}) is None


def test_project_coach_non_int_id_returns_none() -> None:
    assert project_coach({"id": "455", "name": "Stringy Id"}) is None


def test_project_coach_missing_name_returns_none() -> None:
    assert project_coach({"id": 3}) is None


def test_project_coach_blank_nationality_yields_none_fields() -> None:
    projection = project_coach({"id": 4, "name": "C", "nationality": {"name": "", "iso2": ""}})
    assert projection is not None
    assert projection.nationality_name is None
    assert projection.nationality_iso is None
