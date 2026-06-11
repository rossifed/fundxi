"""Unit tests for the ReferenceRefresher.

The bootstrap Application Services it orchestrates have their own
tests; here we only assert the refresher's contract: it runs them,
reloads the id maps, propagates them via the callback, publishes a
``fundxi.reference_refreshed`` notification, and stays alive on
failure (callback NOT invoked, no exception escapes).
"""

import json
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.ingest.infrastructure.reference_refresher import ReferenceRefresher
from src.ingest.infrastructure.sportmonks_id_maps import SportmonksIdMaps

_NEW_MAPS = SportmonksIdMaps(
    fixture_smk_by_internal={70: 2000},
    fixture_group_by_internal={70: "Round of 16"},
    player_id_by_sportmonks={500: 100},
    team_id_by_sportmonks={200: "FRA"},
)


@dataclass(slots=True)
class _RecordingPublisher:
    log: list[tuple[str, bytes]] = field(default_factory=list)

    async def publish(self, subject: str, payload: bytes) -> None:
        self.log.append((subject, payload))


def _fake_session_factory() -> Any:
    @asynccontextmanager
    async def _ctx() -> AsyncGenerator[Any, None]:
        session = MagicMock()
        session.execute = AsyncMock()
        session.commit = AsyncMock()
        session.rollback = AsyncMock()
        yield session

    return MagicMock(side_effect=_ctx)


def _patch_bootstrap(monkeypatch: pytest.MonkeyPatch, *, teams_fail: bool = False) -> None:
    mod = "src.ingest.infrastructure.reference_refresher"

    async def _bootstrap_teams(**_: Any) -> list[tuple[int, str]]:
        if teams_fail:
            raise RuntimeError("simulated Sportmonks 503 during teams refresh")
        return [(200, "FRA"), (201, "ARG")]

    async def _bootstrap_fixtures(**_: Any) -> int:
        return 5

    async def _bootstrap_squads(**_: Any) -> int:
        return 50

    async def _bootstrap_player_stats(**_: Any) -> int:
        return 50

    async def _load_maps(_session: Any) -> SportmonksIdMaps:
        return _NEW_MAPS

    monkeypatch.setattr(f"{mod}.bootstrap_teams", _bootstrap_teams)
    monkeypatch.setattr(f"{mod}.bootstrap_fixtures", _bootstrap_fixtures)
    monkeypatch.setattr(f"{mod}.bootstrap_squads", _bootstrap_squads)
    monkeypatch.setattr(f"{mod}.bootstrap_player_stats", _bootstrap_player_stats)
    monkeypatch.setattr(f"{mod}.load_sportmonks_id_maps", _load_maps)
    # The repo constructors used inside are harmless with a MagicMock session,
    # but stub them to be safe.
    for name in (
        "SqlAlchemyRawSportmonksEventRepository",
        "SqlAlchemyTeamRepository",
        "SqlAlchemyCoachRepository",
        "SqlAlchemyFixtureRepository",
        "SqlAlchemyPlayerRepository",
    ):
        monkeypatch.setattr(f"{mod}.{name}", lambda _s: MagicMock())


def _refresher(publisher: _RecordingPublisher, captured: list[SportmonksIdMaps]) -> ReferenceRefresher:
    return ReferenceRefresher(
        season_id=18017,
        poll_seconds=86400.0,
        client=MagicMock(),
        publisher=publisher,
        session_factory=_fake_session_factory(),
        on_id_maps_reloaded=captured.append,
    )


@pytest.mark.anyio
async def test_refresh_runs_bootstrap_reloads_maps_and_publishes(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_bootstrap(monkeypatch)
    publisher = _RecordingPublisher()
    captured: list[SportmonksIdMaps] = []
    refresher = _refresher(publisher, captured)

    await refresher.refresh_once()

    # callback received the freshly-loaded maps
    assert captured == [_NEW_MAPS]
    # one fundxi.reference_refreshed notification with the team count
    assert len(publisher.log) == 1
    subject, payload = publisher.log[0]
    assert subject == "fundxi.reference_refreshed"
    assert json.loads(payload) == {"kind": "reference_refreshed", "teams": 2}


@pytest.mark.anyio
async def test_failure_does_not_propagate_and_skips_callback(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_bootstrap(monkeypatch, teams_fail=True)
    publisher = _RecordingPublisher()
    captured: list[SportmonksIdMaps] = []
    refresher = _refresher(publisher, captured)

    # Must not raise.
    await refresher.refresh_once()

    # No maps propagated, nothing published.
    assert captured == []
    assert publisher.log == []
