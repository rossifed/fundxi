"""project_team — Sportmonks team payload → (Team, sportmonks_id).

DDD role: Domain Service (pure function), Sportmonks-specific.

Assumed payload shape (Sportmonks v3 /teams):
{
  "id": int,
  "name": str,
  "short_code": str | null,        # ISO-ish, e.g. "FRA"
  "image_path": str | null,        # flag / crest URL
  "type": "national" | "domestic"
}

WC2026 enrichments (flag emoji, color, confederation, group) are NOT in the
Sportmonks payload. They come from a static branding overlay applied by the
bootstrap worker AFTER projection.
"""

from typing import Any

from src.domain.team.team import Team, TeamKind

_KIND_BY_SPORTMONKS_TYPE: dict[str, TeamKind] = {
    "national": TeamKind.NATIONAL,
    "domestic": TeamKind.CLUB,
}


def project_team(payload: dict[str, Any]) -> tuple[Team, int]:
    sportmonks_id = payload["id"]
    if not isinstance(sportmonks_id, int):
        raise TypeError(f"team.id must be int, got {type(sportmonks_id).__name__}")

    short_code = payload.get("short_code")
    if not isinstance(short_code, str) or not short_code:
        raise ValueError(f"team payload missing usable short_code: {payload!r}")

    name = payload.get("name")
    if not isinstance(name, str) or not name:
        raise ValueError(f"team payload missing name: {payload!r}")

    raw_type = payload.get("type", "national")
    if not isinstance(raw_type, str):
        raise TypeError(f"team.type must be str, got {type(raw_type).__name__}")
    kind = _KIND_BY_SPORTMONKS_TYPE.get(raw_type, TeamKind.NATIONAL)

    image_path = payload.get("image_path") or ""

    team = Team(
        id=short_code.upper(),
        name=name,
        flag=image_path if isinstance(image_path, str) else "",
        color="",  # filled by branding overlay
        kind=kind,
        confederation=None,  # filled by branding overlay
        group=None,  # filled by group-stage enrichment
    )
    return team, sportmonks_id
