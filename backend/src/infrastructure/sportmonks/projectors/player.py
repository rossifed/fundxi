"""project_player — Sportmonks player payload → (Player, sportmonks_id).

DDD role: Domain Service (pure function), Sportmonks-specific.

Assumed payload shape (Sportmonks v3 /players?include=position):
{
  "id": int,
  "common_name": str,
  "display_name": str,
  "firstname": str,
  "lastname": str,
  "name": str,                      # full name
  "date_of_birth": "YYYY-MM-DD",
  "height": int | null,             # cm
  "weight": int | null,             # kg
  "position": { "id": int, "name": str },
  "image_path": str | null,
  ...
}

The team_id is supplied by the caller (we reach here through a squad context
where the team is already known). Jersey number likewise comes from the squad
payload, not the player's own profile.
"""

from datetime import date, datetime
from typing import Any

from src.domain.player.player import Player
from src.infrastructure.sportmonks.projectors._position import project_position


def _compute_age(date_of_birth: str | None, *, on_date: date) -> int | None:
    if not date_of_birth:
        return None
    try:
        dob = datetime.strptime(date_of_birth, "%Y-%m-%d").date()
    except ValueError:
        return None
    years = on_date.year - dob.year
    if (on_date.month, on_date.day) < (dob.month, dob.day):
        years -= 1
    return years


def _clean_str(value: object) -> str | None:
    """Strip Unicode whitespace (including the non-breaking space U+00A0 that
    Sportmonks sometimes appends to player names) and normalise empty → None."""
    if not isinstance(value, str):
        return None
    cleaned = value.strip().replace("\xa0", " ").strip()
    return cleaned or None


def project_player(
    payload: dict[str, Any],
    *,
    team_id: str,
    jersey_number: int,
    today: date,
    fallback_position_id: int | None = None,
) -> tuple[Player, int]:
    sportmonks_id = payload["id"]
    if not isinstance(sportmonks_id, int):
        raise TypeError(f"player.id must be int, got {type(sportmonks_id).__name__}")

    name_candidate = (
        _clean_str(payload.get("display_name"))
        or _clean_str(payload.get("common_name"))
        or _clean_str(payload.get("name"))
    )
    if not name_candidate:
        raise ValueError(f"player payload missing usable name: {payload!r}")

    # Position resolution: try the embedded `position` include first (richest),
    # then fall back to player.position_id, then to a caller-provided fallback
    # (typically the squad entry's own position_id). Real-world Sportmonks
    # payloads sometimes have all three None for fringe roster members; we
    # raise so the caller can skip those entries deliberately.
    position = None
    position_payload = payload.get("position")
    if isinstance(position_payload, dict):
        try:
            position = project_position(position_payload)
        except (ValueError, TypeError):
            position = None
    if position is None:
        for pid in (payload.get("position_id"), fallback_position_id):
            if not isinstance(pid, int):
                continue
            try:
                position = project_position({"id": pid})
                break
            except (ValueError, TypeError):
                continue
    if position is None:
        raise ValueError(f"cannot resolve position for player id={sportmonks_id} name={name_candidate!r}")

    full_name = _clean_str(payload.get("name"))

    height_raw = payload.get("height")
    height = height_raw if isinstance(height_raw, int) else None

    weight_raw = payload.get("weight")
    weight = weight_raw if isinstance(weight_raw, int) else None

    dob_raw = payload.get("date_of_birth")
    dob_iso = dob_raw if isinstance(dob_raw, str) else None
    age = _compute_age(dob_iso, on_date=today)
    dob_value: date | None = None
    if dob_iso:
        try:
            dob_value = datetime.strptime(dob_iso, "%Y-%m-%d").date()
        except ValueError:
            dob_value = None

    image_path = _clean_str(payload.get("image_path"))

    detailed_position: str | None = None
    detailed_position_payload = payload.get("detailedposition")
    if isinstance(detailed_position_payload, dict):
        detailed_position = _clean_str(detailed_position_payload.get("name"))

    birth_city: str | None = None
    city_payload = payload.get("city")
    if isinstance(city_payload, dict):
        birth_city = _clean_str(city_payload.get("name"))

    nationality_name: str | None = None
    nationality_iso: str | None = None
    nationality_flag_url: str | None = None
    nationality_payload = payload.get("nationality")
    if isinstance(nationality_payload, dict):
        nationality_name = _clean_str(nationality_payload.get("name"))
        nationality_iso = _clean_str(nationality_payload.get("iso2"))
        nationality_flag_url = _clean_str(nationality_payload.get("image_path"))

    # Sportmonks "preferred foot" lives in the metadata include, not the
    # default player payload. type_id=229 maps to "Preferred Foot" in their
    # metadata taxonomy. Stored verbatim ("left" / "right" / etc.) — UI
    # localisation is the consumer's job.
    foot: str | None = None
    metadata_payload = payload.get("metadata")
    if isinstance(metadata_payload, list):
        for entry in metadata_payload:
            if isinstance(entry, dict) and entry.get("type_id") == 229:
                foot = _clean_str(entry.get("values"))
                if foot:
                    break

    player = Player(
        id=0,  # sentinel; assigned by DB on insert
        name=name_candidate,
        jersey_number=jersey_number,
        team_id=team_id,
        position=position,
        full_name=full_name,
        age=age,
        foot=foot,
        height=height,
        weight=weight,
        image_path=image_path,
        detailed_position=detailed_position,
        date_of_birth=dob_value,
        birth_city=birth_city,
        nationality_name=nationality_name,
        nationality_iso=nationality_iso,
        nationality_flag_url=nationality_flag_url,
    )
    return player, sportmonks_id
