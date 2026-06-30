"""Unit tests for the IngestSupervisor orchestration loop.

Strategy: feed the supervisor a fake clock we control tick-by-tick, a
fake fixture repo with a fixed list of fixtures, and a fake poller
factory that creates dummy pollers that just sleep forever (or until
cancelled). Verify that:

  - Fixtures outside any window get no poller.
  - Fixtures entering their window get a fresh poller spawned.
  - Fixtures leaving their window get their poller cancelled.
  - The concurrency cap is honoured.
  - Exceptions inside ``tick`` do not crash subsequent ticks (covered
    indirectly: the supervisor never raises during the test).
"""

import asyncio
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import pytest

from src.domain.match.fixture import Fixture, FixtureStatus
from src.ingest.application.supervisor import IngestSupervisor
from src.ingest.domain.ports import Poller
from src.ingest.domain.settings import IngestionSettings


@dataclass(slots=True)
class _FakeClock:
    current: datetime

    def now(self) -> datetime:
        return self.current

    def advance(self, minutes: int) -> None:
        self.current += timedelta(minutes=minutes)


@dataclass(slots=True)
class _FakeFixtureRepo:
    fixtures: list[Fixture]

    async def upsert_by_sportmonks_id(self, fixture: Fixture, *, sportmonks_id: int) -> None:
        _ = fixture, sportmonks_id

    async def list_all(self, *, season_id: int | None = None) -> list[Fixture]:
        _ = season_id
        return list(self.fixtures)

    async def get_by_id(self, fixture_id: int) -> Fixture | None:
        return next((f for f in self.fixtures if f.id == fixture_id), None)

    async def list_by_status(self, status: FixtureStatus, *, season_id: int | None = None) -> list[Fixture]:
        _ = season_id
        return [f for f in self.fixtures if f.status is status]

    async def map_sportmonks_to_internal_id(self) -> dict[int, int]:
        return {}

    async def set_kit_colors(
        self,
        *,
        sportmonks_id: int,
        home_kit_color: str | None,
        away_kit_color: str | None,
        home_kit_palette: str | None,
        away_kit_palette: str | None,
    ) -> None:
        _ = (sportmonks_id, home_kit_color, away_kit_color, home_kit_palette, away_kit_palette)

    async def set_formations(
        self,
        *,
        sportmonks_id: int,
        home_formation: str | None,
        away_formation: str | None,
    ) -> None:
        _ = (sportmonks_id, home_formation, away_formation)

    async def set_venue_and_phase(
        self,
        *,
        sportmonks_id: int,
        venue_id: int | None,
        stage_name: str | None,
        round_name: str | None,
    ) -> None:
        _ = (sportmonks_id, venue_id, stage_name, round_name)

    async def set_phase(
        self,
        *,
        sportmonks_id: int,
        stage_name: str | None,
        round_name: str | None,
    ) -> None:
        _ = (sportmonks_id, stage_name, round_name)


@dataclass(slots=True)
class _IdlePoller:
    fixture_id: int
    started: asyncio.Event = field(default_factory=asyncio.Event)
    cancelled: asyncio.Event = field(default_factory=asyncio.Event)

    async def run(self) -> None:
        self.started.set()
        try:
            await asyncio.Event().wait()  # block forever until cancelled
        except asyncio.CancelledError:
            self.cancelled.set()
            raise


@dataclass(slots=True)
class _RecordingFactory:
    created: dict[int, _IdlePoller] = field(default_factory=dict)

    def create_inplay(self, fixture_internal_id: int) -> Poller:
        poller = _IdlePoller(fixture_id=fixture_internal_id)
        self.created[fixture_internal_id] = poller
        return poller


def _fixture(*, fixture_id: int, kickoff_at: datetime | None) -> Fixture:
    return Fixture(
        id=fixture_id,
        home_team_id=f"H{fixture_id}",
        away_team_id=f"A{fixture_id}",
        status=FixtureStatus.UPCOMING,
        group="A",
        kickoff_at=kickoff_at,
    )


async def _settle(times: int = 1) -> None:
    for _ in range(times):
        await asyncio.sleep(0)


def _supervisor(
    *,
    clock: _FakeClock,
    fixtures: Iterable[Fixture],
    factory: _RecordingFactory,
    cap: int = 8,
) -> IngestSupervisor:
    settings = IngestionSettings(
        scheduler_check_seconds=30.0,
        inplay_pre_kickoff_window_min=60,
        inplay_post_ft_window_min=15,
        max_concurrent_inplay_pollers=cap,
    )
    return IngestSupervisor(
        settings=settings,
        fixtures=_FakeFixtureRepo(fixtures=list(fixtures)),
        factory=factory,
        clock=clock,
        sleep=asyncio.sleep,
    )


@pytest.mark.anyio
async def test_no_pollers_for_fixtures_outside_window() -> None:
    kickoff = datetime(2026, 6, 15, 20, 0, tzinfo=UTC)
    far_future_now = kickoff - timedelta(hours=4)  # outside pre-kickoff window
    factory = _RecordingFactory()
    sup = _supervisor(
        clock=_FakeClock(current=far_future_now),
        fixtures=[_fixture(fixture_id=1, kickoff_at=kickoff)],
        factory=factory,
    )

    await sup.tick()

    assert factory.created == {}


@pytest.mark.anyio
async def test_fixture_entering_window_spawns_poller() -> None:
    kickoff = datetime(2026, 6, 15, 20, 0, tzinfo=UTC)
    now = kickoff - timedelta(minutes=30)  # inside the 60-min pre-window
    factory = _RecordingFactory()
    sup = _supervisor(
        clock=_FakeClock(current=now),
        fixtures=[_fixture(fixture_id=1, kickoff_at=kickoff)],
        factory=factory,
    )

    await sup.tick()
    await _settle()

    assert 1 in factory.created
    assert factory.created[1].started.is_set()


@pytest.mark.anyio
async def test_fixture_leaving_window_cancels_its_poller() -> None:
    kickoff = datetime(2026, 6, 15, 20, 0, tzinfo=UTC)
    clock = _FakeClock(current=kickoff)  # during match
    factory = _RecordingFactory()
    sup = _supervisor(
        clock=clock,
        fixtures=[_fixture(fixture_id=1, kickoff_at=kickoff)],
        factory=factory,
    )

    await sup.tick()
    await _settle()
    assert factory.created[1].started.is_set()

    # Advance far past the post-FT window (kickoff + 210 max-duration + 15
    # post-ft = 225'): poller should be cancelled.
    clock.advance(minutes=240)
    await sup.tick()
    await _settle(times=3)

    assert factory.created[1].cancelled.is_set()


@pytest.mark.anyio
async def test_concurrency_cap_is_honoured() -> None:
    kickoff = datetime(2026, 6, 15, 20, 0, tzinfo=UTC)
    clock = _FakeClock(current=kickoff)  # all fixtures inside their windows
    factory = _RecordingFactory()
    sup = _supervisor(
        clock=clock,
        fixtures=[_fixture(fixture_id=i, kickoff_at=kickoff) for i in range(1, 6)],
        factory=factory,
        cap=2,
    )

    await sup.tick()
    await _settle()

    assert len(factory.created) == 2  # cap enforced


@pytest.mark.anyio
async def test_fixtures_without_kickoff_are_ignored() -> None:
    clock = _FakeClock(current=datetime(2026, 6, 15, 20, 0, tzinfo=UTC))
    factory = _RecordingFactory()
    sup = _supervisor(
        clock=clock,
        fixtures=[_fixture(fixture_id=1, kickoff_at=None)],
        factory=factory,
    )

    await sup.tick()

    assert factory.created == {}
