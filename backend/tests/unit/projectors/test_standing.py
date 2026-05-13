"""Unit tests for project_standing."""

from src.infrastructure.sportmonks.projectors.standing import project_standing

_MAPS = {18551: "MAR", 18647: "FRA"}


def _details(**kw: int) -> list[dict[str, object]]:
    code = {
        "played": 129,
        "won": 130,
        "drawn": 131,
        "lost": 132,
        "goals_for": 133,
        "goals_against": 134,
        "goal_difference": 179,
        "points": 187,
    }
    return [{"type_id": code[k], "value": v} for k, v in kw.items()]


def _row(
    *, smk_team: int, group_name: str, position: int, points: int | None = None, **detail_kw: int
) -> dict[str, object]:
    row: dict[str, object] = {
        "participant_id": smk_team,
        "position": position,
        "group": {"id": 1, "name": group_name},
        "details": _details(**detail_kw),
    }
    if points is not None:
        row["points"] = points
    return row


def test_projects_group_stage_row() -> None:
    row = _row(
        smk_team=18551,
        group_name="Group F",
        position=1,
        points=7,
        played=3,
        won=2,
        drawn=1,
        lost=0,
        goals_for=4,
        goals_against=1,
        goal_difference=3,
    )

    s = project_standing(row, team_id_by_sportmonks=_MAPS)

    assert s is not None
    assert s.team_id == "MAR"
    assert s.group == "F"
    assert s.position == 1
    assert s.played == 3
    assert s.won == 2
    assert s.drawn == 1
    assert s.lost == 0
    assert s.goals_for == 4
    assert s.goals_against == 1
    assert s.goal_difference == 3
    assert s.points == 7


def test_points_falls_back_to_detail_when_not_on_row() -> None:
    row = _row(smk_team=18647, group_name="Group D", position=2, points=None)
    # only the detail code carries points
    row["details"] = [{"type_id": 187, "value": 5}]
    s = project_standing(row, team_id_by_sportmonks=_MAPS)
    assert s is not None
    assert s.points == 5


def test_returns_none_for_unknown_team() -> None:
    row = _row(smk_team=999999, group_name="Group A", position=1)
    assert project_standing(row, team_id_by_sportmonks=_MAPS) is None


def test_returns_none_for_non_group_stage_row() -> None:
    # Knockout-bracket rows have names like "Round of 16" — rejected.
    row = _row(smk_team=18551, group_name="Round of 16", position=1)
    assert project_standing(row, team_id_by_sportmonks=_MAPS) is None
    row2 = _row(smk_team=18551, group_name="Final", position=1)
    assert project_standing(row2, team_id_by_sportmonks=_MAPS) is None


def test_returns_none_when_position_missing() -> None:
    row = {"participant_id": 18551, "group": {"name": "Group A"}, "details": []}
    assert project_standing(row, team_id_by_sportmonks=_MAPS) is None


def test_missing_details_default_to_zero() -> None:
    row = _row(smk_team=18551, group_name="Group A", position=4, points=0)
    row["details"] = []  # no detail entries at all
    s = project_standing(row, team_id_by_sportmonks=_MAPS)
    assert s is not None
    assert s.played == 0 and s.won == 0 and s.goals_for == 0 and s.goal_difference == 0
