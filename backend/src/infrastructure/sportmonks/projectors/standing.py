"""project_standing — Sportmonks standings row → Standing.

DDD role: Domain Service (pure function). Sportmonks'
``/standings/seasons/{season_id}?include=details.type;participant;group``
returns one row per team with ``position`` / ``points`` on the row
itself and the rest of the table figures nested under ``details``
(``{"type_id": 130, "value": 2, "type": {"name": "Overall Won"}}``).

We only keep group-stage rows: a row whose ``group.name`` is not of
the form "Group X" (knockout brackets, league tables) returns ``None``.

type_id codes verified against Sportmonks' standing detail catalog
on the WC2022 dataset; if Sportmonks renumbers, change them here only.
"""

from typing import Any

from src.domain.match.standing import Standing

_CODE_PLAYED = 129
_CODE_WON = 130
_CODE_DRAWN = 131
_CODE_LOST = 132
_CODE_GOALS_FOR = 133
_CODE_GOALS_AGAINST = 134
_CODE_GOAL_DIFFERENCE = 179
_CODE_POINTS = 187


def _extract_group_letter(group_payload: object) -> str | None:
    if not isinstance(group_payload, dict):
        return None
    name = group_payload.get("name")
    if not isinstance(name, str):
        return None
    parts = name.strip().split()
    # "Group A" .. "Group L". Reject anything else (knockout rounds etc.).
    if len(parts) == 2 and parts[0].lower() == "group" and 1 <= len(parts[1]) <= 8:
        return parts[1].upper()
    return None


def _int_value(by_code: dict[int, object], code: int) -> int:
    v = by_code.get(code)
    if isinstance(v, bool):
        return 0
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v)
    return 0


def project_standing(
    row: dict[str, Any],
    *,
    team_id_by_sportmonks: dict[int, str],
) -> Standing | None:
    """Project ONE standings row. Returns ``None`` for unknown teams or
    non-group-stage rows."""
    smk_team_id = row.get("participant_id")
    if not isinstance(smk_team_id, int):
        return None
    team_id = team_id_by_sportmonks.get(smk_team_id)
    if team_id is None:
        return None

    group_letter = _extract_group_letter(row.get("group"))
    if group_letter is None:
        return None

    position = row.get("position")
    if not isinstance(position, int):
        return None

    by_code: dict[int, object] = {}
    for det in row.get("details", []):
        if not isinstance(det, dict):
            continue
        code = det.get("type_id")
        if isinstance(code, int):
            by_code[code] = det.get("value")

    # ``points`` is on the row directly; fall back to the detail code.
    points_raw = row.get("points")
    points = points_raw if isinstance(points_raw, int) else _int_value(by_code, _CODE_POINTS)

    return Standing(
        team_id=team_id,
        group=group_letter,
        position=position,
        played=_int_value(by_code, _CODE_PLAYED),
        won=_int_value(by_code, _CODE_WON),
        drawn=_int_value(by_code, _CODE_DRAWN),
        lost=_int_value(by_code, _CODE_LOST),
        goals_for=_int_value(by_code, _CODE_GOALS_FOR),
        goals_against=_int_value(by_code, _CODE_GOALS_AGAINST),
        goal_difference=_int_value(by_code, _CODE_GOAL_DIFFERENCE),
        points=points,
    )
