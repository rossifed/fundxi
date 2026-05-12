"""project_player_match_stat — Sportmonks lineup-with-details payload
→ PlayerMatchStat.

DDD role: Domain Service (pure function). Sportmonks v3 exposes
per-match player statistics under the ``?include=lineups.details``
projection: each lineup entry carries a ``details`` array whose items
look like ``{"type_id": 118, "data": {"value": 8.5}, ...}``. The
``value`` is a plain scalar (int for counters / percentages, float
for the rating) — there is no ``{"total": ...}`` wrapping like the
season-level statistics endpoint uses.

type_id codes (verified against Sportmonks' statistic_types catalog
on the WC2022 final): if Sportmonks renumbers, they change here only.
"""

from typing import Any

from src.domain.match.player_match_stat import PlayerMatchStat

_CODE_MINUTES_PLAYED = 119
_CODE_RATING = 118
_CODE_SHOTS_TOTAL = 42
_CODE_SHOTS_ON_TARGET = 86
_CODE_GOALS = 52
_CODE_ASSISTS = 79
_CODE_YELLOW_CARDS = 84
_CODE_RED_CARDS = 83
_CODE_KEY_PASSES = 117
_CODE_PASSES_TOTAL = 80
_CODE_PASSES_ACCURACY_PCT = 1584  # "Accurate Passes Percentage"


def _detail_value(detail: dict[str, Any]) -> object | None:
    data = detail.get("data")
    if isinstance(data, dict):
        return data.get("value")
    return None


def _as_int(value: object) -> int | None:
    if isinstance(value, bool):  # guard: bools are ints in Python
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return None


def _as_float(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    return None


def project_player_match_stat(
    lineup_payload: dict[str, Any],
    *,
    fixture_id: int,
    player_id_by_sportmonks: dict[int, int],
) -> tuple[PlayerMatchStat, dict[str, Any]] | None:
    """Project ONE lineup entry's ``details`` array into a PlayerMatchStat.

    Returns ``None`` if the lineup carries no details yet (kickoff
    moment, bench players who haven't come on, etc.) or if the player
    can't be resolved to an internal id.
    """
    smk_player_id = lineup_payload.get("player_id")
    if not isinstance(smk_player_id, int):
        return None
    internal_player_id = player_id_by_sportmonks.get(smk_player_id)
    if internal_player_id is None:
        return None

    details = lineup_payload.get("details")
    if not isinstance(details, list) or not details:
        return None

    by_code: dict[int, object] = {}
    for entry in details:
        if not isinstance(entry, dict):
            continue
        code = entry.get("type_id")
        if isinstance(code, int):
            by_code[code] = _detail_value(entry)

    stat = PlayerMatchStat(
        player_id=internal_player_id,
        fixture_id=fixture_id,
        minutes_played=_as_int(by_code.get(_CODE_MINUTES_PLAYED)),
        shots_total=_as_int(by_code.get(_CODE_SHOTS_TOTAL)),
        shots_on_target=_as_int(by_code.get(_CODE_SHOTS_ON_TARGET)),
        goals=_as_int(by_code.get(_CODE_GOALS)),
        assists=_as_int(by_code.get(_CODE_ASSISTS)),
        yellow_cards=_as_int(by_code.get(_CODE_YELLOW_CARDS)),
        red_cards=_as_int(by_code.get(_CODE_RED_CARDS)),
        key_passes=_as_int(by_code.get(_CODE_KEY_PASSES)),
        passes_total=_as_int(by_code.get(_CODE_PASSES_TOTAL)),
        passes_accuracy=_as_float(by_code.get(_CODE_PASSES_ACCURACY_PCT)),
        rating=_as_float(by_code.get(_CODE_RATING)),
    )
    return stat, {"details": details}
