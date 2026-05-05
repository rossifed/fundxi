"""Position mapping — Sportmonks position payload → domain Position enum.

DDD role: Domain Service (pure function). Lives in infrastructure because it
encodes Sportmonks-specific knowledge.

Sportmonks v3 returns position via `?include=position`. We map by `position_id`
when available, then fall back to fuzzy name matching on `position.name`.
"""

from typing import Any

from src.domain.player.player import Position

_BY_SPORTMONKS_POSITION_ID: dict[int, Position] = {
    24: Position.GOALKEEPER,
    25: Position.DEFENDER,
    26: Position.MIDFIELDER,
    27: Position.FORWARD,
}


def _from_position_name(name: str) -> Position:
    lowered = name.lower()
    if "goalkeeper" in lowered or "keeper" in lowered:
        return Position.GOALKEEPER
    if "back" in lowered or "defender" in lowered or "defence" in lowered:
        return Position.DEFENDER
    if "midfield" in lowered:
        return Position.MIDFIELDER
    if "winger" in lowered or "forward" in lowered or "striker" in lowered or "attacker" in lowered:
        return Position.FORWARD
    raise ValueError(f"Unrecognised Sportmonks position name: {name!r}")


def project_position(payload: Any) -> Position:
    """Read a Sportmonks `position` include payload and map to our Position enum."""
    if not isinstance(payload, dict):
        raise TypeError(f"Expected position payload to be a dict, got {type(payload).__name__}")
    position_id = payload.get("id")
    if isinstance(position_id, int) and position_id in _BY_SPORTMONKS_POSITION_ID:
        return _BY_SPORTMONKS_POSITION_ID[position_id]
    name = payload.get("name")
    if isinstance(name, str):
        return _from_position_name(name)
    raise ValueError(f"Cannot derive Position from payload: {payload!r}")
