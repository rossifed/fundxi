"""Projector: per-match kit colors from Sportmonks ``/fixtures/{id}`` metadata.

DDD role: Pure projection function. Reads a list of metadata entries
(``response.data.metadata`` after ``?include=metadata``) and returns
the (home, away) primary kit color + full palette for that fixture.

Sportmonks payload shape (relevant entries):
    [
      {type_id: 161, values: {location: "home", participant: "#C0D6FE",
                              kit: "#7FC2DF,#F0F0F0,#D446BA,…"}},
      {type_id: 162, values: {location: "away", participant: "#002B87",
                              kit: "#022857,#022857,…"}},
      ...other unrelated metadata types (formation, attendance, hashtag)...
    ]

``values.participant`` is the primary kit hex (used for the badge/strip
in the UI); ``values.kit`` is the raw CSV palette for the full strip
(shirt/shorts/socks/GK/variants — kept opaque, the frontend can split
if it ever needs the full palette).

Returns Nones when the metadata entry is missing — never invents data.
"""

from dataclasses import dataclass
from typing import Any

_HOME_KIT_TYPE_ID = 161
_AWAY_KIT_TYPE_ID = 162


@dataclass(frozen=True, slots=True)
class FixtureKitColors:
    home_color: str | None
    away_color: str | None
    home_palette: str | None
    away_palette: str | None


def project_fixture_kit_colors(metadata: list[Any] | None) -> FixtureKitColors:
    home_color: str | None = None
    away_color: str | None = None
    home_palette: str | None = None
    away_palette: str | None = None

    for entry in metadata or []:
        if not isinstance(entry, dict):
            continue
        type_id = entry.get("type_id")
        values = entry.get("values")
        if not isinstance(values, dict):
            continue
        participant = values.get("participant") if isinstance(values.get("participant"), str) else None
        kit = values.get("kit") if isinstance(values.get("kit"), str) else None
        if type_id == _HOME_KIT_TYPE_ID:
            home_color = participant
            home_palette = kit
        elif type_id == _AWAY_KIT_TYPE_ID:
            away_color = participant
            away_palette = kit

    return FixtureKitColors(
        home_color=home_color,
        away_color=away_color,
        home_palette=home_palette,
        away_palette=away_palette,
    )
