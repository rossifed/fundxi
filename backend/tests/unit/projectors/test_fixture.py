"""Unit tests for project_fixture."""

from datetime import datetime

import pytest

from src.domain.match.fixture import FixtureStatus
from src.infrastructure.sportmonks.projectors.fixture import project_fixture


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
    fixture, sportmonks_id = project_fixture(payload, group="A")
    assert sportmonks_id == 19056875
    assert fixture.id == 0
    assert fixture.home_team_id == "FRA"
    assert fixture.away_team_id == "BRA"
    assert fixture.status is FixtureStatus.UPCOMING
    assert fixture.group == "A"
    assert fixture.kickoff_at == datetime(2026, 6, 12, 20, 0, 0)
    assert fixture.minute is None
    assert fixture.season_id is None  # absent in payload → None


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
    fixture, _ = project_fixture(payload, group="")
    assert fixture.season_id == 18017
    # non-int / garbage → None, never raises (pricing/ingest must not break)
    bad = {**payload, "season_id": "oops"}
    assert project_fixture(bad, group="")[0].season_id is None


def test_project_fixture_live() -> None:
    payload = {
        "id": 1,
        "starting_at": "2026-06-12 20:00:00",
        "state": {"state": "INPLAY_2ND_HALF"},
        "participants": _participants(),
        "minute": 67,
    }
    fixture, _ = project_fixture(payload, group="A")
    assert fixture.status is FixtureStatus.LIVE
    assert fixture.minute == 67


def test_project_fixture_finished() -> None:
    payload = {
        "id": 2,
        "starting_at": "2026-06-12 20:00:00",
        "state": {"state": "FT"},
        "participants": _participants(),
    }
    fixture, _ = project_fixture(payload, group="A")
    assert fixture.status is FixtureStatus.FINISHED


def test_project_fixture_unknown_state_falls_back_to_upcoming() -> None:
    payload = {
        "id": 3,
        "starting_at": "2026-06-12 20:00:00",
        "state": {"state": "NEW_FANCY_STATE"},
        "participants": _participants(),
    }
    fixture, _ = project_fixture(payload, group="A")
    assert fixture.status is FixtureStatus.UPCOMING


def test_project_fixture_missing_state_falls_back_to_upcoming() -> None:
    payload = {
        "id": 4,
        "starting_at": "2026-06-12 20:00:00",
        "participants": _participants(),
    }
    fixture, _ = project_fixture(payload, group="A")
    assert fixture.status is FixtureStatus.UPCOMING


def test_project_fixture_missing_participants_raises() -> None:
    payload = {"id": 5, "starting_at": "2026-06-12 20:00:00", "participants": []}
    with pytest.raises(ValueError, match="participants"):
        project_fixture(payload, group="A")


def test_project_fixture_iso_kickoff_format() -> None:
    payload = {
        "id": 6,
        "starting_at": "2026-06-12T20:00:00Z",
        "participants": _participants(),
    }
    fixture, _ = project_fixture(payload, group="A")
    assert fixture.kickoff_at == datetime(2026, 6, 12, 20, 0, 0)


def test_project_fixture_unparseable_kickoff_yields_none() -> None:
    payload = {
        "id": 7,
        "starting_at": "yesterday",
        "participants": _participants(),
    }
    fixture, _ = project_fixture(payload, group="A")
    assert fixture.kickoff_at is None
