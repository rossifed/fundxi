"""project_venue — Sportmonks venue payload → (name, city, capacity, sportmonks_id).

DDD role: Domain Service (pure function), Sportmonks-specific.

Assumed payload shape (Sportmonks v3 /fixtures?include=venue):
{
  "id": int,
  "name": str,
  "city_name": str | null,
  "capacity": int | null,
  ...
}
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class VenueProjection:
    sportmonks_id: int
    name: str
    city: str | None
    capacity: int | None


def project_venue(payload: Any) -> VenueProjection | None:
    if not isinstance(payload, dict):
        return None
    smk_id = payload.get("id")
    name = payload.get("name")
    if not isinstance(smk_id, int) or not isinstance(name, str) or not name:
        return None
    city = payload.get("city_name")
    capacity = payload.get("capacity")
    return VenueProjection(
        sportmonks_id=smk_id,
        name=name,
        city=city if isinstance(city, str) and city else None,
        capacity=capacity if isinstance(capacity, int) else None,
    )
