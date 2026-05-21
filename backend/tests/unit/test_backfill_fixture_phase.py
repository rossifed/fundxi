"""Unit tests for the backfill_fixture_phase use case.

In-memory fakes for the Sportmonks client, the raw archive and the
fixture repo — no DB, no network. Asserts the use case extracts the
authoritative ``stage`` / ``round`` names and writes ONLY the phase
labels, and that a fixture whose payload carries no phase is skipped
(not written with NULLs).
"""

from dataclasses import dataclass, field
from typing import Any

import pytest

from src.application.backfill_fixture_phase import backfill_fixture_phase

pytestmark = pytest.mark.anyio


@dataclass
class FakeClient:
    """Returns a canned envelope per ``/fixtures/{id}`` endpoint."""

    envelopes: dict[str, dict[str, Any]] = field(default_factory=dict)
    calls: list[tuple[str, dict[str, Any] | None]] = field(default_factory=list)

    async def get(self, endpoint: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self.calls.append((endpoint, params))
        return self.envelopes.get(endpoint, {"data": {}})


@dataclass
class FakeArchive:
    inserted: list[tuple[str, dict[str, Any]]] = field(default_factory=list)

    async def insert_if_new(
        self, *, endpoint: str, params: dict[str, Any], response: dict[str, Any]
    ) -> bool:
        self.inserted.append((endpoint, response))
        return True


@dataclass
class FakeFixtureRepo:
    phases: dict[int, tuple[str | None, str | None]] = field(default_factory=dict)

    async def set_phase(
        self, *, sportmonks_id: int, stage_name: str | None, round_name: str | None
    ) -> None:
        self.phases[sportmonks_id] = (stage_name, round_name)

    # The use case only calls ``set_phase`` — the rest of the port is
    # unused here, so the fake intentionally omits it.


class FakeSession:
    """Minimal stand-in: ``execute`` returns a canned scalar list of
    sportmonks ids. The use case only does one SELECT."""

    def __init__(self, smk_ids: list[int]) -> None:
        self._smk_ids = smk_ids

    async def execute(self, _stmt: Any) -> Any:
        ids = self._smk_ids

        class _Result:
            @staticmethod
            def scalars() -> Any:
                class _Scalars:
                    @staticmethod
                    def all() -> list[int]:
                        return ids

                return _Scalars()

        return _Result()


def _envelope(stage: str | None, round_: str | None) -> dict[str, Any]:
    data: dict[str, Any] = {"id": 1}
    if stage is not None:
        data["stage"] = {"id": 10, "name": stage}
    if round_ is not None:
        data["round"] = {"id": 20, "name": round_}
    return {"data": data}


async def test_backfill_writes_stage_and_round_names() -> None:
    client = FakeClient(
        envelopes={
            "/fixtures/100": _envelope("Round of 16", "Round of 16"),
            "/fixtures/200": _envelope("Final", "Final"),
        }
    )
    archive = FakeArchive()
    repo = FakeFixtureRepo()
    session = FakeSession([100, 200])

    report = await backfill_fixture_phase(
        session=session,  # type: ignore[arg-type]
        client=client,  # type: ignore[arg-type]
        raw_archive=archive,  # type: ignore[arg-type]
        fixture_repo=repo,  # type: ignore[arg-type]
    )

    assert report.fixtures_seen == 2
    assert report.updated == 2
    assert report.skipped_no_phase == 0
    assert repo.phases[100] == ("Round of 16", "Round of 16")
    assert repo.phases[200] == ("Final", "Final")
    # Each fixture's raw response is archived (data-sourcing rule).
    assert len(archive.inserted) == 2
    # Only the narrow phase include is requested.
    assert all(params == {"include": "stage;round"} for _ep, params in client.calls)


async def test_backfill_skips_fixture_without_phase() -> None:
    """A payload with neither stage nor round must NOT be written — we
    do not blank an existing label with NULLs."""
    client = FakeClient(envelopes={"/fixtures/300": _envelope(None, None)})
    archive = FakeArchive()
    repo = FakeFixtureRepo()
    session = FakeSession([300])

    report = await backfill_fixture_phase(
        session=session,  # type: ignore[arg-type]
        client=client,  # type: ignore[arg-type]
        raw_archive=archive,  # type: ignore[arg-type]
        fixture_repo=repo,  # type: ignore[arg-type]
    )

    assert report.fixtures_seen == 1
    assert report.updated == 0
    assert report.skipped_no_phase == 1
    assert repo.phases == {}
    # Still archived — the raw response is kept even when it has no phase.
    assert len(archive.inserted) == 1


async def test_backfill_writes_stage_only_when_round_missing() -> None:
    """Group-stage fixtures often carry a stage but no knockout round.
    The stage label must still be written."""
    client = FakeClient(envelopes={"/fixtures/400": _envelope("Group Stage", None)})
    archive = FakeArchive()
    repo = FakeFixtureRepo()
    session = FakeSession([400])

    report = await backfill_fixture_phase(
        session=session,  # type: ignore[arg-type]
        client=client,  # type: ignore[arg-type]
        raw_archive=archive,  # type: ignore[arg-type]
        fixture_repo=repo,  # type: ignore[arg-type]
    )

    assert report.updated == 1
    assert repo.phases[400] == ("Group Stage", None)
