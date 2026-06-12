"""Unit tests for project_player_match_stat."""

from src.infrastructure.sportmonks.projectors.player_match_stat import project_player_match_stat

_MAPS = {96611: 777, 188444: 888}


def _lineup(player_smk: int, details: list[dict[str, object]]) -> dict[str, object]:
    return {"id": 1, "player_id": player_smk, "team_id": 18647, "type_id": 11, "details": details}


def test_projects_known_stats_into_typed_fields() -> None:
    lineup = _lineup(
        96611,
        [
            {"type_id": 119, "data": {"value": 120}},  # minutes
            {"type_id": 118, "data": {"value": 8.5}},  # rating
            {"type_id": 52, "data": {"value": 3}},  # goals
            {"type_id": 42, "data": {"value": 6}},  # shots total
            {"type_id": 86, "data": {"value": 3}},  # shots on target
            {"type_id": 80, "data": {"value": 21}},  # passes total
            {"type_id": 1584, "data": {"value": 76}},  # passes accuracy %
            {"type_id": 5304, "data": {"value": 0.6849}},  # xG — kept as float
            {"type_id": 999, "data": {"value": 42}},  # unknown code → ignored
        ],
    )

    result = project_player_match_stat(lineup, fixture_id=65, player_id_by_sportmonks=_MAPS)

    assert result is not None
    stat, raw = result
    assert stat.player_id == 777
    assert stat.fixture_id == 65
    assert stat.minutes_played == 120
    assert stat.rating == 8.5
    assert stat.goals == 3
    assert stat.shots_total == 6
    assert stat.shots_on_target == 3
    assert stat.passes_total == 21
    assert stat.passes_accuracy == 76.0
    # xG keeps its fractional part (NOT truncated to int)
    assert stat.xg == 0.6849
    # missing codes default to None
    assert stat.assists is None
    assert stat.yellow_cards is None
    # raw payload preserved for future re-projection
    assert raw == {"details": lineup["details"]}


def test_returns_none_when_no_details() -> None:
    assert project_player_match_stat(_lineup(96611, []), fixture_id=65, player_id_by_sportmonks=_MAPS) is None
    lineup_no_details_key = {"id": 1, "player_id": 96611, "team_id": 1, "type_id": 11}
    assert project_player_match_stat(lineup_no_details_key, fixture_id=65, player_id_by_sportmonks=_MAPS) is None


def test_returns_none_when_player_unknown() -> None:
    lineup = _lineup(424242, [{"type_id": 118, "data": {"value": 7.0}}])
    assert project_player_match_stat(lineup, fixture_id=65, player_id_by_sportmonks=_MAPS) is None


def test_returns_none_when_player_id_not_int() -> None:
    lineup = {"id": 1, "player_id": "oops", "details": [{"type_id": 118, "data": {"value": 7.0}}]}
    assert project_player_match_stat(lineup, fixture_id=65, player_id_by_sportmonks=_MAPS) is None


def test_int_codes_truncate_floats_and_reject_bools() -> None:
    lineup = _lineup(
        188444,
        [
            {"type_id": 80, "data": {"value": 44.9}},  # passes → 44
            {"type_id": 52, "data": {"value": True}},  # goals → None (bool guard)
        ],
    )
    result = project_player_match_stat(lineup, fixture_id=65, player_id_by_sportmonks=_MAPS)
    assert result is not None
    stat, _ = result
    assert stat.passes_total == 44
    assert stat.goals is None
