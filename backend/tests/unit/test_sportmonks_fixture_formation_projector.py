"""Unit tests for ``project_fixture_formations``."""

from src.infrastructure.sportmonks.projectors.fixture_formation import (
    project_fixture_formations,
)


def test_projects_home_and_away_from_type_id_159() -> None:
    metadata = [
        {"type_id": 35, "values": {"neutral": True}},
        {"type_id": 159, "values": {"home": "4-3-3", "away": "4-2-3-1"}},
        {"type_id": 161, "values": {"participant": "#C0D6FE"}},
    ]
    f = project_fixture_formations(metadata)
    assert f.home == "4-3-3"
    assert f.away == "4-2-3-1"


def test_returns_nones_when_type_159_missing() -> None:
    f = project_fixture_formations([{"type_id": 35, "values": {"neutral": True}}])
    assert f.home is None
    assert f.away is None


def test_returns_nones_when_metadata_is_none() -> None:
    f = project_fixture_formations(None)
    assert f.home is None
    assert f.away is None


def test_ignores_malformed_entries() -> None:
    metadata = [
        None,
        {"type_id": 159},  # no values
        {"type_id": 159, "values": "not a dict"},
        {"type_id": 159, "values": {"home": 442, "away": ["not", "a", "string"]}},
    ]
    f = project_fixture_formations(metadata)  # type: ignore[arg-type]
    assert f.home is None
    assert f.away is None
