"""project_lineup — Sportmonks lineup payload → (Lineup, sportmonks_id).

DDD role: Domain Service (pure function).

Assumed shape (Sportmonks v3 /fixtures/{id}?include=lineups.position):
{
  "id": int,
  "fixture_id": int,
  "player_id": int,                 # Sportmonks
  "team_id": int,                   # Sportmonks
  "position_id": int,
  "type_id": int,                   # 11 = starter, 12 = bench
  "formation_position": int | null,
  "jersey_number": int | null,
  "position": { "id": int, "name": str, "code": str, ... }
}

Resolves sportmonks player_id → internal player_id and sportmonks team_id →
internal team ISO code via injected lookup maps.
"""

from typing import Any

from src.domain.match.lineup import Lineup, LineupRole
from src.infrastructure.sportmonks.projectors._position import project_position

_TYPE_STARTER = 11
_TYPE_BENCH = 12


def project_lineup(
    payload: dict[str, Any],
    *,
    fixture_id: int,
    player_id_by_sportmonks: dict[int, int],
    team_id_by_sportmonks: dict[int, str],
) -> tuple[Lineup, int]:
    sportmonks_id = payload["id"]
    if not isinstance(sportmonks_id, int):
        raise TypeError(f"lineup.id must be int, got {type(sportmonks_id).__name__}")

    smk_player_id = payload.get("player_id")
    if not isinstance(smk_player_id, int):
        raise ValueError(f"lineup payload missing player_id: {payload!r}")
    internal_player_id = player_id_by_sportmonks.get(smk_player_id)
    if internal_player_id is None:
        raise ValueError(f"lineup references unknown player sportmonks_id={smk_player_id}")

    smk_team_id = payload.get("team_id")
    if not isinstance(smk_team_id, int):
        raise ValueError(f"lineup payload missing team_id: {payload!r}")
    internal_team_id = team_id_by_sportmonks.get(smk_team_id)
    if internal_team_id is None:
        raise ValueError(f"lineup references unknown team sportmonks_id={smk_team_id}")

    type_id = payload.get("type_id")
    if type_id == _TYPE_STARTER:
        role = LineupRole.STARTER
    elif type_id == _TYPE_BENCH:
        role = LineupRole.BENCH
    else:
        # Sportmonks sometimes uses other type_ids for managers/coaches; skip those.
        raise ValueError(f"lineup type_id={type_id} is not a player role")

    # Position: prefer the include, fall back to position_id.
    pos_payload = payload.get("position")
    if isinstance(pos_payload, dict):
        position = project_position(pos_payload)
    else:
        pid = payload.get("position_id")
        if not isinstance(pid, int):
            raise ValueError(f"lineup payload missing position info: {payload!r}")
        position = project_position({"id": pid})

    jersey = payload.get("jersey_number")
    formation_position = payload.get("formation_position")
    formation_field = payload.get("formation_field")

    lineup = Lineup(
        id=0,
        fixture_id=fixture_id,
        player_id=internal_player_id,
        team_id=internal_team_id,
        role=role,
        position=position.value,
        jersey_number=jersey if isinstance(jersey, int) else None,
        formation_position=formation_position if isinstance(formation_position, int) else None,
        formation_field=formation_field if isinstance(formation_field, str) else None,
    )
    return lineup, sportmonks_id
