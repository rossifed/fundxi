"""Unit tests for project_player_stat (tournament-aggregate projector)."""

import pytest

from src.infrastructure.sportmonks.projectors.player_stat import project_player_stat


def _block(details: list[dict[str, object]]) -> dict[str, object]:
    return {"id": 86786083, "season_id": 18017, "details": details}


def test_projects_known_stats_into_typed_fields() -> None:
    block = _block(
        [
            {"type_id": 321, "value": {"total": 7}},  # appearances
            {"type_id": 119, "value": {"total": 540}},  # minutes
            {"type_id": 52, "value": {"total": 3, "goals": 3, "penalties": 0}},  # goals
            {"type_id": 79, "value": {"total": 2}},  # assists
            {"type_id": 84, "value": {"total": 1}},  # yellow cards
            {"type_id": 83, "value": {"total": 0}},  # red cards
            {"type_id": 42, "value": {"total": 11}},  # shots total
            {"type_id": 86, "value": {"total": 5}},  # shots on target
            {"type_id": 117, "value": {"total": 9}},  # key passes
            {"type_id": 80, "value": {"total": 232}},  # passes total
            {"type_id": 1584, "value": {"total": 85.34}},  # passes accuracy %
            {"type_id": 118, "value": {"average": 7.21}},  # rating
            {"type_id": 99999, "value": {"total": 1}},  # unknown → ignored
        ]
    )

    stat, smk_id, raw = project_player_stat(block, internal_player_id=575)

    assert smk_id == 86786083
    assert stat.player_id == 575
    assert stat.season_id == 18017
    assert stat.appearances == 7
    assert stat.minutes_played == 540
    assert stat.goals == 3
    assert stat.assists == 2
    assert stat.yellow_cards == 1
    assert stat.red_cards == 0
    assert stat.shots_total == 11
    assert stat.shots_on_target == 5
    assert stat.key_passes == 9
    assert stat.passes_total == 232
    # accuracy keeps its fractional part (NOT truncated to 85)
    assert stat.passes_accuracy == 85.34
    assert stat.rating_avg == 7.21
    # raw details preserved for future re-projection
    assert raw == {"details": block["details"]}


def test_missing_passes_stats_default_to_none() -> None:
    stat, _smk, _raw = project_player_stat(
        _block([{"type_id": 52, "value": {"total": 1}}]),
        internal_player_id=10,
    )
    assert stat.passes_total is None
    assert stat.passes_accuracy is None


def test_rejects_block_without_season_id() -> None:
    with pytest.raises(ValueError, match="season_id"):
        project_player_stat({"id": 1, "details": []}, internal_player_id=10)
