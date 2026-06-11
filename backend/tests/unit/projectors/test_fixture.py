"""Unit tests for project_fixture."""

from datetime import datetime

import pytest

from src.domain.match.fixture import FixtureStatus
from src.infrastructure.sportmonks.projectors.fixture import project_fixture

# Sportmonks team id -> internal id. Home/away are resolved through this map by
# the stable numeric team id, never by the drift-prone short_code.
_TEAM_MAP = {18: "FRA", 17: "BRA"}


def _participants() -> list[dict[str, object]]:
    return [
        {"id": 18, "name": "France", "short_code": "FRA", "meta": {"location": "home"}},
        {"id": 17, "name": "Brazil", "short_code": "BRA", "meta": {"location": "away"}},
    ]


def test_project_fixture_upcoming() -> None:
    payload = {
        "id": 19056875,
        "starting_at": "2026-06-12 20:00:00",
        "state": {"id": 1, "state": "NS"},
        "participants": _participants(),
        "minute": None,
    }
    fixture, sportmonks_id = project_fixture(payload, group="A", team_id_by_sportmonks=_TEAM_MAP)
    assert sportmonks_id == 19056875
    assert fixture.id == 0
    assert fixture.home_team_id == "FRA"
    assert fixture.away_team_id == "BRA"
    assert fixture.status is FixtureStatus.UPCOMING
    assert fixture.group == "A"
    assert fixture.kickoff_at == datetime(2026, 6, 12, 20, 0, 0)
    assert fixture.minute is None
    assert fixture.season_id is None  # absent in payload → None


def test_project_fixture_resolves_team_by_id_not_short_code() -> None:
    """Regression: Sportmonks' short_code drifts across endpoints for the same
    team — South Africa is ``ZAF`` on /teams (so the team table is keyed ZAF)
    but ``RSA`` inside a fixture's participants block. Resolution MUST use the
    stable numeric team id, otherwise the fixture FK to ``team`` breaks and the
    whole live match fails to persist (the 2026-06-11 opener bug)."""
    payload = {
        "id": 19609127,
        "starting_at": "2026-06-11 19:00:00",
        "state": {"state": "INPLAY_1ST_HALF"},
        "participants": [
            {"id": 16, "name": "Mexico", "short_code": "MEX", "meta": {"location": "home"}},
            # short_code says RSA, but the team table is keyed ZAF — the id wins.
            {"id": 99, "name": "South Africa", "short_code": "RSA", "meta": {"location": "away"}},
        ],
    }
    fixture, _ = project_fixture(payload, group="A", team_id_by_sportmonks={16: "MEX", 99: "ZAF"})
    assert fixture.home_team_id == "MEX"
    assert fixture.away_team_id == "ZAF"


def test_project_fixture_unmapped_team_raises() -> None:
    """A participant whose Sportmonks id is not in the team map (knockout TBD
    placeholder, or a team not yet ingested) is unprojectable — callers skip."""
    payload = {
        "id": 42,
        "starting_at": "2026-06-12 20:00:00",
        "state": {"state": "NS"},
        "participants": _participants(),
    }
    with pytest.raises(ValueError, match="unmapped sportmonks team id"):
        project_fixture(payload, group="A", team_id_by_sportmonks={18: "FRA"})  # away (17) missing


def test_project_fixture_reads_native_season_id() -> None:
    """season_id is taken verbatim from the Sportmonks payload (it is a
    native field on every fixture) — scopes the fixture to its tournament."""
    payload = {
        "id": 18452325,
        "season_id": 18017,
        "starting_at": "2022-12-18 15:00:00",
        "state": {"id": 1, "state": "NS"},
        "participants": _participants(),
    }
    fixture, _ = project_fixture(payload, group="", team_id_by_sportmonks=_TEAM_MAP)
    assert fixture.season_id == 18017
    # non-int / garbage → None, never raises (pricing/ingest must not break)
    bad = {**payload, "season_id": "oops"}
    assert project_fixture(bad, group="", team_id_by_sportmonks=_TEAM_MAP)[0].season_id is None


def test_project_fixture_live() -> None:
    payload = {
        "id": 1,
        "starting_at": "2026-06-12 20:00:00",
        "state": {"state": "INPLAY_2ND_HALF"},
        "participants": _participants(),
        "minute": 67,
    }
    fixture, _ = project_fixture(payload, group="A", team_id_by_sportmonks=_TEAM_MAP)
    assert fixture.status is FixtureStatus.LIVE
    assert fixture.minute == 67


def test_project_fixture_finished() -> None:
    payload = {
        "id": 2,
        "starting_at": "2026-06-12 20:00:00",
        "state": {"state": "FT"},
        "participants": _participants(),
    }
    fixture, _ = project_fixture(payload, group="A", team_id_by_sportmonks=_TEAM_MAP)
    assert fixture.status is FixtureStatus.FINISHED


def test_project_fixture_unknown_state_falls_back_to_upcoming() -> None:
    payload = {
        "id": 3,
        "starting_at": "2026-06-12 20:00:00",
        "state": {"state": "NEW_FANCY_STATE"},
        "participants": _participants(),
    }
    fixture, _ = project_fixture(payload, group="A", team_id_by_sportmonks=_TEAM_MAP)
    assert fixture.status is FixtureStatus.UPCOMING


def test_project_fixture_missing_state_falls_back_to_upcoming() -> None:
    payload = {
        "id": 4,
        "starting_at": "2026-06-12 20:00:00",
        "participants": _participants(),
    }
    fixture, _ = project_fixture(payload, group="A", team_id_by_sportmonks=_TEAM_MAP)
    assert fixture.status is FixtureStatus.UPCOMING


def test_project_fixture_missing_participants_raises() -> None:
    payload = {"id": 5, "starting_at": "2026-06-12 20:00:00", "participants": []}
    with pytest.raises(ValueError, match="participants"):
        project_fixture(payload, group="A", team_id_by_sportmonks=_TEAM_MAP)


def test_project_fixture_iso_kickoff_format() -> None:
    payload = {
        "id": 6,
        "starting_at": "2026-06-12T20:00:00Z",
        "participants": _participants(),
    }
    fixture, _ = project_fixture(payload, group="A", team_id_by_sportmonks=_TEAM_MAP)
    assert fixture.kickoff_at == datetime(2026, 6, 12, 20, 0, 0)


def test_project_fixture_unparseable_kickoff_yields_none() -> None:
    payload = {
        "id": 7,
        "starting_at": "yesterday",
        "participants": _participants(),
    }
    fixture, _ = project_fixture(payload, group="A", team_id_by_sportmonks=_TEAM_MAP)
    assert fixture.kickoff_at is None
