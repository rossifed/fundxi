"""Spawn / cancel per-fixture inplay pollers as their windows open and close.

DDD role: Application Service. The supervisor itself is a long-running
async loop; each tick it:

  1. Asks the clock for ``now``.
  2. Asks the fixture repository for all fixtures.
  3. Decides — through the pure ``is_in_inplay_window`` rule — which
     fixtures should be polling right now.
  4. Cancels the asyncio.Task of any fixture that just left its
     window (or finished prematurely).
  5. Spawns a new poller for any fixture that just entered its window,
     respecting the configured concurrency cap.

Per-fixture pollers live on their own; the supervisor never waits for
their work to complete. Errors inside a poller therefore cannot block
the supervisor or any sibling fixture.
"""

import asyncio
from dataclasses import dataclass, field

import structlog

from src.domain.match.fixture_repository import FixtureRepository
from src.ingest.domain.inplay_window import is_in_inplay_window
from src.ingest.domain.ports import Clock, PollerFactory, SleepFn
from src.ingest.domain.settings import IngestionSettings

log = structlog.get_logger(__name__)


@dataclass(slots=True)
class IngestSupervisor:
    settings: IngestionSettings
    fixtures: FixtureRepository
    factory: PollerFactory
    clock: Clock
    sleep: SleepFn
    _tasks: dict[int, asyncio.Task[None]] = field(default_factory=dict)

    async def run(self) -> None:
        """Main loop. Returns only when the surrounding task is cancelled."""
        log.info("ingest.supervisor.start", check_seconds=self.settings.scheduler_check_seconds)
        try:
            while True:
                try:
                    await self.tick()
                except Exception as exc:
                    log.error("ingest.supervisor.tick_failed", error=str(exc))
                await self.sleep(self.settings.scheduler_check_seconds)
        except asyncio.CancelledError:
            await self._cancel_all()
            raise

    async def tick(self) -> None:
        """One synchronisation step. Pure logic apart from the IO call to
        ``fixtures.list_all`` and the task spawning / cancelling."""
        now = self.clock.now()
        fixtures = await self.fixtures.list_all()
        active_now: set[int] = set()
        for fx in fixtures:
            if fx.kickoff_at is None:
                continue
            if is_in_inplay_window(
                now=now,
                kickoff_at=fx.kickoff_at,
                pre_kickoff_min=self.settings.inplay_pre_kickoff_window_min,
                post_ft_min=self.settings.inplay_post_ft_window_min,
                max_match_duration_min=self.settings.inplay_max_match_duration_min,
            ):
                active_now.add(fx.id)

        # Reap finished or out-of-window tasks first so the cap check
        # below sees an accurate count.
        reaped: list[asyncio.Task[None]] = []
        for fixture_id in list(self._tasks):
            task = self._tasks[fixture_id]
            if task.done() or fixture_id not in active_now:
                task.cancel()
                reaped.append(self._tasks.pop(fixture_id))
                log.info("ingest.supervisor.poller_stopped", fixture_id=fixture_id)
        # Await the cancelled/finished tasks so they actually unwind AND so
        # any exception they raised is retrieved — otherwise a poller that
        # died (rather than cancelled cleanly) leaks its error as an
        # unretrieved-exception warning and we never learn it crashed.
        if reaped:
            results = await asyncio.gather(*reaped, return_exceptions=True)
            for res in results:
                if isinstance(res, BaseException) and not isinstance(res, asyncio.CancelledError):
                    log.error("ingest.supervisor.poller_crashed", error=str(res))

        # Spawn missing pollers up to the concurrency cap.
        for fixture_id in active_now - self._tasks.keys():
            if len(self._tasks) >= self.settings.max_concurrent_inplay_pollers:
                log.warning(
                    "ingest.supervisor.cap_reached",
                    cap=self.settings.max_concurrent_inplay_pollers,
                    pending=len(active_now - self._tasks.keys()),
                )
                break
            poller = self.factory.create_inplay(fixture_id)
            self._tasks[fixture_id] = asyncio.create_task(poller.run(), name=f"inplay-{fixture_id}")
            log.info("ingest.supervisor.poller_spawned", fixture_id=fixture_id)

    async def _cancel_all(self) -> None:
        tasks = list(self._tasks.values())
        for fixture_id, task in list(self._tasks.items()):
            task.cancel()
            log.info("ingest.supervisor.poller_cancelled_on_shutdown", fixture_id=fixture_id)
        self._tasks.clear()
        # Await the cancellations so the pollers unwind and their exceptions
        # are retrieved before the supervisor task itself finishes.
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
