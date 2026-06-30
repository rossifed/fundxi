"""Unit tests for project_fixture."""

from datetime import datetime

import pytest

from src.domain.match.fixture import FixtureStatus
from src.infrastructure.sportmonks.projectors.fixture import project_fixture, project_fixture_prediction

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


def test_project_fixture_reads_stage_and_round() -> None:
    """The list bootstrap includes ``stage;round`` so a fixture carries its
    tournament phase from the first pass — the bracket view filters on
    ``stage_name`` and renders empty without it."""
    payload = {
        "id": 19609200,
        "starting_at": "2026-06-29 20:00:00",
        "state": {"state": "NS"},
        "participants": _participants(),
        "stage": {"id": 10, "name": "Round of 32"},
        "round": {"id": 20, "name": "Round 4"},
    }
    fixture, _ = project_fixture(payload, group="", team_id_by_sportmonks=_TEAM_MAP)
    assert fixture.stage_name == "Round of 32"
    assert fixture.round_name == "Round 4"


def test_project_fixture_phase_absent_is_none() -> None:
    """Phase includes are optional — a payload without stage/round (e.g. the
    live inplay poller, which does not request them) yields None, never raises."""
    payload = {
        "id": 1,
        "starting_at": "2026-06-12 20:00:00",
        "state": {"state": "NS"},
        "participants": _participants(),
    }
    fixture, _ = project_fixture(payload, group="A", team_id_by_sportmonks=_TEAM_MAP)
    assert fixture.stage_name is None
    assert fixture.round_name is None


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


def test_project_fixture_minute_from_ticking_period() -> None:
    """Sportmonks v3 has no top-level fixture minute during live play; the clock
    is the ticking period's `minutes` (include=periods). The non-ticking period
    (1st half, ended) must be ignored."""
    payload = {
        "id": 1,
        "starting_at": "2026-06-11 19:00:00",
        "state": {"state": "INPLAY_2ND_HALF"},
        "participants": _participants(),
        "periods": [
            {"description": "1st-half", "ticking": False, "minutes": 45},
            {"description": "2nd-half", "ticking": True, "minutes": 58},
        ],
    }
    fixture, _ = project_fixture(payload, group="A", team_id_by_sportmonks=_TEAM_MAP)
    assert fixture.status is FixtureStatus.LIVE
    assert fixture.minute == 58


def test_project_fixture_no_ticking_period_yields_none() -> None:
    payload = {
        "id": 1,
        "starting_at": "2026-06-11 19:00:00",
        "state": {"state": "HT"},
        "participants": _participants(),
        "periods": [{"description": "1st-half", "ticking": False, "minutes": 45}],
    }
    fixture, _ = project_fixture(payload, group="A", team_id_by_sportmonks=_TEAM_MAP)
    assert fixture.minute is None


def test_project_fixture_finished() -> None:
    payload = {
        "id": 2,
        "starting_at": "2026-06-12 20:00:00",
        "state": {"state": "FT"},
        "participants": _participants(),
    }
    fixture, _ = project_fixture(payload, group="A", team_id_by_sportmonks=_TEAM_MAP)
    assert fixture.status is FixtureStatus.FINISHED


@pytest.mark.parametrize("state_code", ["AET", "FT_PEN"])
def test_project_fixture_extra_time_and_penalty_finish_are_finished(state_code: str) -> None:
    """A knockout decided after extra time (AET) or on penalties (FT_PEN) is
    FINISHED — these are the real Sportmonks terminal codes for knockouts and
    must settle exactly like a regulation FT."""
    payload = {
        "id": 3,
        "starting_at": "2026-06-29 20:30:00",
        "state": {"state": state_code},
        "participants": _participants(),
    }
    fixture, _ = project_fixture(payload, group="", team_id_by_sportmonks=_TEAM_MAP)
    assert fixture.status is FixtureStatus.FINISHED


@pytest.mark.parametrize("state_code", ["EXTRA_TIME_BREAK", "PEN_BREAK", "NEW_FANCY_STATE"])
def test_project_fixture_unmapped_inplay_state_stays_live(state_code: str) -> None:
    """Regression (WC2026 R32 Germany-Paraguay): a PRESENT but unenumerated
    in-play sub-state must keep a started fixture LIVE, never regress it to
    UPCOMING. The live phase is open-ended — only not-started and terminal codes
    are closed sets — so anything else means the match is in progress.
    ``EXTRA_TIME_BREAK`` (break between extra-time halves) was the exact state
    that flipped the fixture back to 'upcoming' mid-match."""
    payload = {
        "id": 3,
        "starting_at": "2026-06-29 20:30:00",
        "state": {"state": state_code},
        "participants": _participants(),
    }
    fixture, _ = project_fixture(payload, group="", team_id_by_sportmonks=_TEAM_MAP)
    assert fixture.status is FixtureStatus.LIVE


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


# --- prediction projector (FULLTIME_RESULT_PROBABILITY, type 237) ----------


def test_project_fixture_prediction_normalises_percentages() -> None:
    # Sportmonks ships percentages; we normalise to fractions summing to 1.
    payload = {
        "predictions": [
            {"type_id": 100, "predictions": {"yes": 30.0, "no": 70.0}},  # other type, ignored
            {"type_id": 237, "predictions": {"home": 59.7, "draw": 21.0, "away": 19.3}},
        ]
    }
    result = project_fixture_prediction(payload)
    assert result is not None
    p_home, p_draw, p_away = result
    assert p_home + p_draw + p_away == pytest.approx(1.0)
    assert p_home == pytest.approx(0.597)
    assert p_away == pytest.approx(0.193)


def test_project_fixture_prediction_accepts_wrapped_data_list() -> None:
    # The include can arrive as {"data": [...]} depending on the call shape.
    payload = {"predictions": {"data": [{"type_id": 237, "predictions": {"home": 50, "draw": 0, "away": 50}}]}}
    result = project_fixture_prediction(payload)
    assert result == pytest.approx((0.5, 0.0, 0.5))


def test_project_fixture_prediction_absent_or_malformed_is_none() -> None:
    assert project_fixture_prediction({}) is None  # no predictions include
    assert project_fixture_prediction({"predictions": []}) is None  # empty
    assert project_fixture_prediction({"predictions": [{"type_id": 999}]}) is None  # wrong type
    # type 237 present but values missing → None, never raises.
    assert project_fixture_prediction({"predictions": [{"type_id": 237, "predictions": {"home": 50}}]}) is None
