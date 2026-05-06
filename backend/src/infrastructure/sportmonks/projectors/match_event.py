"""project_match_event — Sportmonks event payload → (MatchEvent, sportmonks_id).

DDD role: Domain Service (pure function).

Assumed shape (Sportmonks v3 /fixtures/{id}?include=events.type):
{
  "id": int,
  "fixture_id": int,
  "participant_id": int | null,    # Sportmonks team id
  "player_id": int | null,         # Sportmonks
  "related_player_id": int | null,
  "minute": int,
  "extra_minute": int | null,
  "info": str | null,              # e.g. "Penalty", "2nd Penalty"
  "sort_order": int,
  "type": { "code": str, "name": str, ... }
}
"""

from typing import Any

from src.domain.match.match_event import MatchEvent, MatchEventType

_TYPE_BY_CODE: dict[str, MatchEventType] = {
    "goal": MatchEventType.GOAL,
    "owngoal": MatchEventType.OWN_GOAL,
    "own-goal": MatchEventType.OWN_GOAL,
    "penalty": MatchEventType.PENALTY,
    "missed_penalty": MatchEventType.PENALTY_MISSED,
    "missed-penalty": MatchEventType.PENALTY_MISSED,
    "penaltymissed": MatchEventType.PENALTY_MISSED,
    "yellowcard": MatchEventType.YELLOW_CARD,
    "yellow-card": MatchEventType.YELLOW_CARD,
    "redcard": MatchEventType.RED_CARD,
    "red-card": MatchEventType.RED_CARD,
    "yellowredcard": MatchEventType.YELLOW_RED_CARD,
    "yellow-red-card": MatchEventType.YELLOW_RED_CARD,
    "substitution": MatchEventType.SUBSTITUTION,
    "var": MatchEventType.VAR,
    "injury": MatchEventType.INJURY,
}


def _classify_type(payload: dict[str, Any]) -> MatchEventType:
    type_payload = payload.get("type")
    if isinstance(type_payload, dict):
        code = type_payload.get("code")
        if isinstance(code, str):
            mapped = _TYPE_BY_CODE.get(code.lower().replace("_", "-"))
            if mapped is not None:
                return mapped
    return MatchEventType.OTHER


def project_match_event(
    payload: dict[str, Any],
    *,
    fixture_id: int,
    player_id_by_sportmonks: dict[int, int],
    team_id_by_sportmonks: dict[int, str],
) -> tuple[MatchEvent, int]:
    sportmonks_id = payload["id"]
    if not isinstance(sportmonks_id, int):
        raise TypeError(f"event.id must be int, got {type(sportmonks_id).__name__}")

    minute = payload.get("minute")
    if not isinstance(minute, int):
        raise ValueError(f"event payload missing minute: {payload!r}")

    extra = payload.get("extra_minute")
    extra_minute = extra if isinstance(extra, int) else None

    raw_smk_player = payload.get("player_id")
    player_id = player_id_by_sportmonks.get(raw_smk_player) if isinstance(raw_smk_player, int) else None

    raw_smk_related = payload.get("related_player_id")
    related_player_id = player_id_by_sportmonks.get(raw_smk_related) if isinstance(raw_smk_related, int) else None

    raw_smk_team = payload.get("participant_id")
    team_id = team_id_by_sportmonks.get(raw_smk_team) if isinstance(raw_smk_team, int) else None

    info_raw = payload.get("info")
    info = info_raw if isinstance(info_raw, str) and info_raw else None

    sort_order = payload.get("sort_order")
    sequence = sort_order if isinstance(sort_order, int) else 0

    event = MatchEvent(
        id=0,
        fixture_id=fixture_id,
        minute=minute,
        extra_minute=extra_minute,
        type=_classify_type(payload),
        player_id=player_id,
        related_player_id=related_player_id,
        team_id=team_id,
        info=info,
        sequence=sequence,
    )
    return event, sportmonks_id
