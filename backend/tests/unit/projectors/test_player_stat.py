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


def test_projects_enriched_stats_into_typed_fields() -> None:
    block = _block(
        [
            {"type_id": 41, "value": {"total": 4}},  # shots off target
            {"type_id": 51, "value": {"total": 2}},  # offsides
            {"type_id": 580, "value": {"total": 3}},  # big chances created
            {"type_id": 116, "value": {"total": 210}},  # accurate passes
            {"type_id": 98, "value": {"total": 12}},  # total crosses
            {"type_id": 99, "value": {"total": 5}},  # accurate crosses
            {"type_id": 122, "value": {"total": 30}},  # long balls
            {"type_id": 124, "value": {"total": 6}},  # through balls
            {"type_id": 108, "value": {"total": 9}},  # dribble attempts
            {"type_id": 109, "value": {"total": 7}},  # successful dribbles
            {"type_id": 94, "value": {"total": 8}},  # dispossessed
            {"type_id": 110, "value": {"total": 4}},  # dribbled past
            {"type_id": 96, "value": {"total": 11}},  # fouls drawn
            {"type_id": 78, "value": {"total": 14}},  # tackles
            {"type_id": 100, "value": {"total": 13}},  # interceptions
            {"type_id": 101, "value": {"total": 18}},  # clearances
            {"type_id": 105, "value": {"total": 40}},  # total duels
            {"type_id": 106, "value": {"total": 22}},  # duels won
            {"type_id": 107, "value": {"total": 9}},  # aerials won
            {"type_id": 58, "value": {"total": 3}},  # shots blocked
            {"type_id": 56, "value": {"total": 10}},  # fouls
            {"type_id": 57, "value": {"total": 15}},  # saves
            {"type_id": 88, "value": {"total": 6}},  # goals conceded
            {"type_id": 581, "value": {"total": 2}},  # big chances missed
            {"type_id": 324, "value": {"total": 1}},  # own goals
            {"type_id": 571, "value": {"total": 1}},  # errors leading to a goal
            {"type_id": 194, "value": {"total": 3}},  # clean sheets
        ]
    )

    stat, _smk, _raw = project_player_stat(block, internal_player_id=42)

    assert stat.shots_off_target == 4
    assert stat.offsides == 2
    assert stat.big_chances_created == 3
    assert stat.accurate_passes == 210
    assert stat.crosses_total == 12
    assert stat.crosses_accurate == 5
    assert stat.long_balls == 30
    assert stat.through_balls == 6
    assert stat.dribble_attempts == 9
    assert stat.dribbles_completed == 7
    assert stat.dispossessed == 8
    assert stat.dribbled_past == 4
    assert stat.fouls_drawn == 11
    assert stat.tackles == 14
    assert stat.interceptions == 13
    assert stat.clearances == 18
    assert stat.total_duels == 40
    assert stat.duels_won == 22
    assert stat.aerials_won == 9
    assert stat.shots_blocked == 3
    assert stat.fouls == 10
    assert stat.saves == 15
    assert stat.goals_conceded == 6
    assert stat.big_chances_missed == 2
    assert stat.own_goals == 1
    assert stat.errors_leading_to_goal == 1
    assert stat.clean_sheets == 3


def test_enriched_stats_default_to_none_when_absent() -> None:
    stat, _smk, _raw = project_player_stat(
        _block([{"type_id": 321, "value": {"total": 1}}]),
        internal_player_id=10,
    )
    assert stat.tackles is None
    assert stat.saves is None
    assert stat.big_chances_created is None


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


def test_second_yellow_sending_off_counts_as_red() -> None:
    """Regression (Embolo vs Argentina, WC2026): Sportmonks encodes a
    second-yellow sending-off as type 85 (yellowred), NOT type 83 — mapping
    only 83 showed 1 yellow / 0 red for a sent-off player."""
    stat, _smk, _raw = project_player_stat(
        _block(
            [
                {"type_id": 84, "value": {"total": 1}},  # yellow cards
                {"type_id": 85, "value": {"total": 1}},  # yellow-red (2nd yellow)
            ]
        ),
        internal_player_id=918,
    )
    assert stat.yellow_cards == 1
    assert stat.red_cards == 1


def test_straight_red_and_yellow_red_sum_into_red_cards() -> None:
    stat, _smk, _raw = project_player_stat(
        _block(
            [
                {"type_id": 83, "value": {"total": 1}},  # straight red
                {"type_id": 85, "value": {"total": 1}},  # yellow-red
            ]
        ),
        internal_player_id=918,
    )
    assert stat.red_cards == 2
