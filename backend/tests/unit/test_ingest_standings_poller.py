"""Unit tests for the StandingsPoller orchestration.

Strategy: stub the Sportmonks client with a canned standings envelope,
fake the AsyncSession factory, record NATS publishes. Verify the
endpoint/include, the per-row upsert count, the single
``fundxi.standings`` notification, and HTTP-failure resilience.
"""

import json
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.infrastructure.sportmonks.client import SportmonksError
from src.ingest.infrastructure.standings_poller import StandingsPoller


@dataclass(slots=True)
class _StubClient:
    response: dict[str, Any]
    raise_on_get: Exception | None = None
    captured_endpoint: str = ""
    captured_params: dict[str, Any] | None = None

    async def get(self, endpoint: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self.captured_endpoint = endpoint
        self.captured_params = params
        if self.raise_on_get is not None:
            raise self.raise_on_get
        return self.response


@dataclass(slots=True)
class _RecordingPublisher:
    log: list[tuple[str, bytes]] = field(default_factory=list)

    async def publish(self, subject: str, payload: bytes) -> None:
        self.log.append((subject, payload))


def _fake_session_factory() -> Any:
    @asynccontextmanager
    async def _ctx() -> AsyncGenerator[Any, None]:
        result_mock = MagicMock()
        result_mock.scalar_one_or_none = MagicMock(return_value=None)
        session = MagicMock()
        session.execute = AsyncMock(return_value=result_mock)
        session.commit = AsyncMock()
        session.rollback = AsyncMock()
        yield session

    return MagicMock(side_effect=_ctx)


def _standings_envelope(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {"data": rows}


def _row(*, smk_team: int, group_name: str, position: int) -> dict[str, Any]:
    return {
        "participant_id": smk_team,
        "position": position,
        "points": 7,
        "group": {"name": group_name},
        "details": [
            {"type_id": 129, "value": 3},
            {"type_id": 130, "value": 2},
            {"type_id": 131, "value": 1},
            {"type_id": 132, "value": 0},
            {"type_id": 133, "value": 4},
            {"type_id": 134, "value": 1},
            {"type_id": 179, "value": 3},
        ],
    }


_TEAM_MAPS = {18551: "MAR", 18647: "FRA", 18644: "ARG"}


def _poller(
    *, response: dict[str, Any], raise_on_get: Exception | None = None
) -> tuple[StandingsPoller, _RecordingPublisher, _StubClient]:
    client = _StubClient(response=response, raise_on_get=raise_on_get)
    publisher = _RecordingPublisher()
    poller = StandingsPoller(
        season_id=18017,
        poll_seconds=300.0,
        client=client,
        publisher=publisher,
        session_factory=_fake_session_factory(),
        team_id_by_sportmonks=_TEAM_MAPS,
    )
    return poller, publisher, client


@pytest.mark.anyio
async def test_uses_correct_endpoint_and_include() -> None:
    poller, _, client = _poller(response=_standings_envelope([]))

    await poller.poll_once()

    assert client.captured_endpoint == "/standings/seasons/18017"
    assert client.captured_params == {"include": "details.type;participant;group"}


@pytest.mark.anyio
async def test_known_group_stage_rows_emit_one_notification_with_count() -> None:
    rows = [
        _row(smk_team=18551, group_name="Group F", position=1),
        _row(smk_team=18647, group_name="Group D", position=1),
        _row(smk_team=999999, group_name="Group A", position=1),  # unknown team → skipped
        _row(smk_team=18644, group_name="Round of 16", position=1),  # knockout → skipped
    ]
    poller, publisher, _ = _poller(response=_standings_envelope(rows))

    await poller.poll_once()

    assert len(publisher.log) == 1
    subject, payload = publisher.log[0]
    assert subject == "fundxi.standings"
    assert json.loads(payload) == {"kind": "standings", "count": 2}


@pytest.mark.anyio
async def test_no_group_stage_rows_publishes_nothing() -> None:
    rows = [_row(smk_team=18644, group_name="Final", position=1)]
    poller, publisher, _ = _poller(response=_standings_envelope(rows))

    await poller.poll_once()

    assert publisher.log == []


@pytest.mark.anyio
async def test_http_failure_does_not_raise() -> None:
    poller, publisher, _ = _poller(response={}, raise_on_get=SportmonksError("simulated 503"))

    await poller.poll_once()  # must not raise

    assert publisher.log == []
