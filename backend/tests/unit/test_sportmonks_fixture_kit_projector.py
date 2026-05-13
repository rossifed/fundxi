"""Unit tests for ``project_fixture_kit_colors``."""

from src.infrastructure.sportmonks.projectors.fixture_kit import (
    project_fixture_kit_colors,
)


def test_projects_home_and_away_from_type_ids() -> None:
    metadata = [
        {"type_id": 35, "values": {"neutral": True}},
        {
            "type_id": 161,
            "values": {"location": "home", "participant": "#C0D6FE", "kit": "#7FC2DF,#F0F0F0"},
        },
        {
            "type_id": 162,
            "values": {"location": "away", "participant": "#002B87", "kit": "#022857,#022857"},
        },
        {"type_id": 578, "values": {"attendance": 88966}},
    ]
    kit = project_fixture_kit_colors(metadata)
    assert kit.home_color == "#C0D6FE"
    assert kit.away_color == "#002B87"
    assert kit.home_palette == "#7FC2DF,#F0F0F0"
    assert kit.away_palette == "#022857,#022857"


def test_returns_nones_when_metadata_missing_kit_entries() -> None:
    kit = project_fixture_kit_colors([{"type_id": 35, "values": {"neutral": True}}])
    assert kit.home_color is None
    assert kit.away_color is None
    assert kit.home_palette is None
    assert kit.away_palette is None


def test_returns_nones_when_metadata_is_none() -> None:
    kit = project_fixture_kit_colors(None)
    assert kit.home_color is None
    assert kit.away_color is None


def test_ignores_non_dict_or_malformed_entries() -> None:
    metadata = [
        None,  # not a dict — must be skipped silently
        {"type_id": 161},  # no values
        {"type_id": 161, "values": "not a dict"},  # wrong value shape
        {"type_id": 162, "values": {"participant": 123, "kit": ["not", "a", "string"]}},  # wrong types
    ]
    kit = project_fixture_kit_colors(metadata)  # type: ignore[arg-type]
    assert kit.home_color is None
    assert kit.away_color is None
    assert kit.home_palette is None
    assert kit.away_palette is None
