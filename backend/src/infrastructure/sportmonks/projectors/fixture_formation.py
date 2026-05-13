"""Projector: per-match tactical formation from Sportmonks fixture metadata.

DDD role: Pure projection function. Reads a list of metadata entries
(``response.data.metadata`` after ``?include=metadata``) and returns
the (home, away) formation strings.

Sportmonks payload shape (type_id 159 is the formation entry):
    {type_id: 159, values: {home: "4-3-3", away: "4-2-3-1"}}

Returns ``(None, None)`` when the metadata entry is missing — never
invents data.
"""

from dataclasses import dataclass
from typing import Any

_FORMATION_TYPE_ID = 159


@dataclass(frozen=True, slots=True)
class FixtureFormations:
    home: str | None
    away: str | None


def project_fixture_formations(metadata: list[Any] | None) -> FixtureFormations:
    for entry in metadata or []:
        if not isinstance(entry, dict):
            continue
        if entry.get("type_id") != _FORMATION_TYPE_ID:
            continue
        values = entry.get("values")
        if not isinstance(values, dict):
            continue
        home = values.get("home") if isinstance(values.get("home"), str) else None
        away = values.get("away") if isinstance(values.get("away"), str) else None
        return FixtureFormations(home=home, away=away)
    return FixtureFormations(home=None, away=None)
