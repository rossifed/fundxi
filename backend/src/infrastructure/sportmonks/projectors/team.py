"""project_team — Sportmonks team payload → (Team, sportmonks_id).

DDD role: Domain Service (pure function), Sportmonks-specific.

Assumed payload shape (Sportmonks v3 /teams?include=...;country.continent):
{
  "id": int,
  "name": str,
  "short_code": str | null,        # ISO-ish, e.g. "FRA"
  "image_path": str | null,        # flag / crest URL
  "type": "national" | "domestic",
  "country": { "continent": { "name": str } } | null
}

``continent`` is taken from the nested country.continent include. Team
colour is derived separately from kit palettes; ``group`` from standings.
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

    continent: str | None = None
    country = payload.get("country")
    if isinstance(country, dict):
        cont = country.get("continent")
        if isinstance(cont, dict) and isinstance(cont.get("name"), str) and cont["name"]:
            continent = cont["name"]

    team = Team(
        id=short_code.upper(),
        name=name,
        flag=image_path if isinstance(image_path, str) else "",
        color="",  # derived from kit palettes post-ingest
        kind=kind,
        continent=continent,
        group=None,  # resolved from standings
    )
    return team, sportmonks_id
