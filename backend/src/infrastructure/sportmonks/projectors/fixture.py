"""project_fixture — Sportmonks fixture payload → (Fixture, sportmonks_id).

DDD role: Domain Service (pure function), Sportmonks-specific.

Assumed payload shape (Sportmonks v3 /fixtures?include=participants;scores;state):
{
  "id": int,
  "starting_at": "YYYY-MM-DD HH:MM:SS",
  "state": { "id": int, "state": "NS" | "INPLAY_1ST_HALF" | "FT" | ... },
  "participants": [
    { "id": int, "name": str, "short_code": "FRA", "meta": { "location": "home" | "away" } }
  ],
  "scores": [ ... ],
  "minute": int | null
}

Group attribution (A..L) is not natively in /fixtures and is added by an
enrichment overlay (WC2026 group stage mapping).
"""

from datetime import datetime
from typing import Any, cast

from src.domain.match.fixture import Fixture, FixtureStatus

_LIVE_STATES = {
    "INPLAY_1ST_HALF",
    "INPLAY_2ND_HALF",
    "HT",
    "BREAK",
    "EXTRA_TIME",
    "PEN_LIVE",
    "INPLAY_ET",
}
_FINISHED_STATES = {"FT", "AET", "FT_PEN", "POSTPONED", "CANCELLED", "ABANDONED", "AWARDED"}
_UPCOMING_STATES = {"NS", "TBA", "DELAYED"}


def _project_status(state_payload: object) -> FixtureStatus:
    if not isinstance(state_payload, dict):
        return FixtureStatus.UPCOMING
    code = cast(dict[str, Any], state_payload).get("state")
    if not isinstance(code, str):
        return FixtureStatus.UPCOMING
    if code in _LIVE_STATES:
        return FixtureStatus.LIVE
    if code in _FINISHED_STATES:
        return FixtureStatus.FINISHED
    if code in _UPCOMING_STATES:
        return FixtureStatus.UPCOMING
    return FixtureStatus.UPCOMING


def _team_id_from_participants(participants: list[dict[str, Any]], location: str) -> str:
    for p in participants:
        meta = p.get("meta")
        if not isinstance(meta, dict):
            continue
        meta_typed = cast(dict[str, Any], meta)
        if meta_typed.get("location") != location:
            continue
        short_code = p.get("short_code")
        if isinstance(short_code, str) and short_code:
            return short_code.upper()
    raise ValueError(f"No participant with meta.location={location!r}")


def _parse_kickoff(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def project_fixture(payload: dict[str, Any], *, group: str) -> tuple[Fixture, int]:
    sportmonks_id = payload["id"]
    if not isinstance(sportmonks_id, int):
        raise TypeError(f"fixture.id must be int, got {type(sportmonks_id).__name__}")

    raw_participants = payload.get("participants")
    if not isinstance(raw_participants, list) or len(raw_participants) != 2:
        raise ValueError(f"fixture payload missing two participants: {payload!r}")
    participants = cast(list[dict[str, Any]], raw_participants)

    home_team_id = _team_id_from_participants(participants, "home")
    away_team_id = _team_id_from_participants(participants, "away")

    status = _project_status(payload.get("state"))

    minute_raw = payload.get("minute")
    minute = minute_raw if isinstance(minute_raw, int) else None

    fixture = Fixture(
        id=0,
        home_team_id=home_team_id,
        away_team_id=away_team_id,
        status=status,
        group=group,
        kickoff_at=_parse_kickoff(payload.get("starting_at")),
        minute=minute,
    )
    return fixture, sportmonks_id
