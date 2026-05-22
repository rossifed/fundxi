"""project_coach — Sportmonks coach entity → CoachProjection.

DDD role: Domain Service (pure function), Sportmonks-specific.

Payload shape — the coach entity nested under a team's ``coaches`` pivot
(``include=coaches.coach.country``), verified against the real v3 API:
{
  "id": int,
  "name": str,                          # or display_name / common_name
  "image_path": str | null,
  "country": { "name": str, "iso2": str } | null   # the coach's nationality
}

Returns None (rather than raising) on an unusable payload — the head coach
is non-essential decoration, so the team still ingests without it.
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class CoachProjection:
    sportmonks_id: int
    name: str
    image_path: str | None
    nationality_name: str | None
    nationality_iso: str | None


def project_coach(payload: Any) -> CoachProjection | None:
    if not isinstance(payload, dict):
        return None

    smk_id = payload.get("id")
    if not isinstance(smk_id, int):
        return None

    name = payload.get("name") or payload.get("display_name") or payload.get("common_name")
    if not isinstance(name, str) or not name:
        return None

    image_path = payload.get("image_path")

    nationality_name: str | None = None
    nationality_iso: str | None = None
    # The coach's nationality rides in the nested ``country`` object;
    # ``nationality`` is kept as a fallback key for robustness.
    country = payload.get("country") or payload.get("nationality")
    if isinstance(country, dict):
        country_name = country.get("name")
        country_iso = country.get("iso2") or country.get("iso3")
        nationality_name = country_name if isinstance(country_name, str) and country_name else None
        nationality_iso = country_iso if isinstance(country_iso, str) and country_iso else None

    return CoachProjection(
        sportmonks_id=smk_id,
        name=name,
        image_path=image_path if isinstance(image_path, str) and image_path else None,
        nationality_name=nationality_name,
        nationality_iso=nationality_iso,
    )
