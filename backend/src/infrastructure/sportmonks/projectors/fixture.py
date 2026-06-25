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
  # NOTE: home/away are resolved by participant.id (stable Sportmonks team id),
  # NOT short_code — see _team_id_from_participants for why.
  "scores": [ ... ],
  "periods": [ { "ticking": bool, "minutes": int, ... } ]   # live clock
}

Group attribution (A..L) is not natively in /fixtures and is added by an
enrichment overlay (WC2026 group stage mapping).
"""

from collections.abc import Mapping
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


def project_fixture_state(payload: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    """``(state_code, full state object)`` from a fixture payload, or ``None`` when
    the ``state`` include is absent/malformed.

    The coarse ``status`` (``_project_status``) buckets every state into
    upcoming/live/finished; this preserves the RAW Sportmonks state we pay for
    (INPLAY_1ST_HALF, HT, INPLAY_2ND_HALF, BREAK, EXTRA_TIME, PEN_LIVE, FT, ...)
    so the ingest can log each transition and the trading gate can tell half-time
    from open play. Pure — no I/O."""
    state = payload.get("state")
    if not isinstance(state, dict):
        return None
    code = cast(dict[str, Any], state).get("state")
    if not isinstance(code, str) or not code:
        return None
    return code, cast(dict[str, Any], state)


def _score_for(scores_payload: object, location: str, *, description: str) -> int | None:
    """Pick a score block's goals for the home/away participant. Sportmonks
    emits several blocks per fixture (1ST_HALF, 2ND_HALF, ET, CURRENT,
    PENALTY_SHOOTOUT); ``description`` selects which one."""
    if not isinstance(scores_payload, list):
        return None
    for entry in scores_payload:
        if not isinstance(entry, dict):
            continue
        if entry.get("description") != description:
            continue
        score = entry.get("score")
        if not isinstance(score, dict):
            continue
        if score.get("participant") != location:
            continue
        goals = score.get("goals")
        if isinstance(goals, int):
            return goals
    return None


def _final_score(scores_payload: object, location: str) -> int | None:
    """The full-time ('CURRENT') score for a participant — regulation + ET, but
    NOT the penalty shootout (that is a separate block)."""
    return _score_for(scores_payload, location, description="CURRENT")


def penalty_shootout_winner(scores_payload: object) -> str | None:
    """``"home"`` / ``"away"`` for a knockout decided on penalties, or ``None``
    when there was no shootout (or it is undecided). Reads the
    ``PENALTY_SHOOTOUT`` score block — the side with more converted penalties
    won. This is what lets a team eliminated on penalties take the -40% drop
    that the level CURRENT score alone cannot reveal."""
    home = _score_for(scores_payload, "home", description="PENALTY_SHOOTOUT")
    away = _score_for(scores_payload, "away", description="PENALTY_SHOOTOUT")
    if home is None or away is None:
        return None
    if home > away:
        return "home"
    if away > home:
        return "away"
    return None


def _team_id_from_participants(
    participants: list[dict[str, Any]],
    location: str,
    team_id_by_sportmonks: Mapping[int, str],
) -> str:
    """Resolve the internal team id for the home/away participant.

    The join key is the Sportmonks **team id** (the integer ``participant.id``),
    NOT ``short_code``: Sportmonks' ``short_code`` drifts across endpoints for
    the same team (e.g. South Africa is ``ZAF`` on ``/teams`` but ``RSA`` in a
    fixture's ``participants`` block), which would break the ``team`` FK. The
    numeric team id is stable everywhere, so we map it through the same
    ``sportmonks_id → internal_id`` table the rest of the ingest uses.

    Raises ``ValueError`` when the participant is missing, has no integer id, or
    its id is unmapped — e.g. a knockout placeholder ("Winner Quarter-final 1")
    that is not a real team. Callers treat that as "skip this fixture".
    """
    for p in participants:
        meta = p.get("meta")
        if not isinstance(meta, dict):
            continue
        meta_typed = cast(dict[str, Any], meta)
        if meta_typed.get("location") != location:
            continue
        sportmonks_team_id = p.get("id")
        if not isinstance(sportmonks_team_id, int):
            raise ValueError(f"participant for location={location!r} has no integer id")
        internal_id = team_id_by_sportmonks.get(sportmonks_team_id)
        if internal_id is None:
            raise ValueError(f"unmapped sportmonks team id={sportmonks_team_id} (location={location!r})")
        return internal_id
    raise ValueError(f"No participant with meta.location={location!r}")


def _live_minute(payload: dict[str, Any]) -> int | None:
    """The running match minute.

    Sportmonks v3 has NO top-level ``minute`` on a fixture during live play —
    the clock lives on the period whose ``ticking`` flag is true (its
    ``minutes`` field). Requires ``include=periods`` (the inplay poller asks
    for it; the static bootstrap does not, so upcoming fixtures simply yield
    ``None``). Falls back to an explicit top-level ``minute`` when present
    (some payloads / test fixtures), else ``None``.
    """
    periods = payload.get("periods")
    items = periods.get("data") if isinstance(periods, dict) else periods
    if isinstance(items, list):
        for period in items:
            if isinstance(period, dict) and period.get("ticking") is True:
                minutes = period.get("minutes")
                if isinstance(minutes, int):
                    return minutes
    minute_raw = payload.get("minute")
    return minute_raw if isinstance(minute_raw, int) else None


def _parse_kickoff(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def project_fixture(
    payload: dict[str, Any], *, group: str, team_id_by_sportmonks: Mapping[int, str]
) -> tuple[Fixture, int]:
    sportmonks_id = payload["id"]
    if not isinstance(sportmonks_id, int):
        raise TypeError(f"fixture.id must be int, got {type(sportmonks_id).__name__}")

    raw_participants = payload.get("participants")
    if not isinstance(raw_participants, list) or len(raw_participants) != 2:
        raise ValueError(f"fixture payload missing two participants: {payload!r}")
    participants = cast(list[dict[str, Any]], raw_participants)

    home_team_id = _team_id_from_participants(participants, "home", team_id_by_sportmonks)
    away_team_id = _team_id_from_participants(participants, "away", team_id_by_sportmonks)

    status = _project_status(payload.get("state"))

    minute = _live_minute(payload)

    scores_payload = payload.get("scores")
    home_score = _final_score(scores_payload, "home")
    away_score = _final_score(scores_payload, "away")

    season_raw = payload.get("season_id")
    season_id = season_raw if isinstance(season_raw, int) else None

    fixture = Fixture(
        id=0,
        home_team_id=home_team_id,
        away_team_id=away_team_id,
        status=status,
        group=group,
        home_score=home_score,
        away_score=away_score,
        kickoff_at=_parse_kickoff(payload.get("starting_at")),
        minute=minute,
        season_id=season_id,
    )
    return fixture, sportmonks_id
