"""Unit tests for project_fixture_state (raw Sportmonks state capture)."""

from src.infrastructure.sportmonks.projectors.fixture import project_fixture_state


def _payload(code: str) -> dict[str, object]:
    return {"id": 1, "state": {"id": 3, "state": code, "name": "Halftime", "short_name": "HT"}}


def test_returns_code_and_full_state_object() -> None:
    out = project_fixture_state(_payload("HT"))
    assert out is not None
    code, obj = out
    assert code == "HT"
    # The FULL state object is preserved verbatim (not just the code).
    assert obj["name"] == "Halftime"
    assert obj["short_name"] == "HT"


def test_none_when_state_absent_or_malformed() -> None:
    assert project_fixture_state({"id": 1}) is None
    assert project_fixture_state({"id": 1, "state": {}}) is None
    assert project_fixture_state({"id": 1, "state": {"state": None}}) is None
    assert project_fixture_state({"id": 1, "state": "HT"}) is None
