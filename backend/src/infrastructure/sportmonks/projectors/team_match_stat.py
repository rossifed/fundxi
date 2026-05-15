"""project_team_match_stats — Sportmonks fixture.statistics → list of stats.

DDD role: Domain Service (pure function). Maps Sportmonks
``?include=statistics.type`` blocks to a flat list of
``TeamMatchStatProjection`` rows.

Assumed payload shape (one entry per (team, type)):
{
  "type_id": int,
  "participant_id": int,      # Sportmonks team id
  "location": "home" | "away",
  "data": { "value": float | int },
  "type": { "code": str, "name": str }
}
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Any


@dataclass(frozen=True, slots=True)
class TeamMatchStatProjection:
    sportmonks_team_id: int
    type_code: str
    value: Decimal | None


def project_team_match_stats(payload: Any) -> list[TeamMatchStatProjection]:
    if not isinstance(payload, list):
        return []
    out: list[TeamMatchStatProjection] = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        smk_team_id = entry.get("participant_id")
        type_obj = entry.get("type") or {}
        type_code = type_obj.get("code") if isinstance(type_obj, dict) else None
        data = entry.get("data") or {}
        raw_value = data.get("value") if isinstance(data, dict) else None
        if not isinstance(smk_team_id, int) or not isinstance(type_code, str) or not type_code:
            continue
        value: Decimal | None
        if isinstance(raw_value, (int, float)):
            value = Decimal(str(raw_value))
        else:
            value = None
        out.append(TeamMatchStatProjection(sportmonks_team_id=smk_team_id, type_code=type_code, value=value))
    return out
