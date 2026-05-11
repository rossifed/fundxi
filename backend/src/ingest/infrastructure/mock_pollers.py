"""No-op pollers used during étape A to validate orchestration only.

DDD role: Adapter (driven). The mock poller emits a heartbeat log
line every ``poll_seconds`` and never touches Sportmonks. The
factory returns one such mock per fixture.

This lets us exercise the supervisor's spawn / cancel logic in
isolation; étape B replaces these implementations with a real
HTTP-driven poller without changing the supervisor.
"""

import asyncio
from dataclasses import dataclass

import structlog

from src.ingest.domain.ports import Poller, SleepFn

log = structlog.get_logger(__name__)


@dataclass(slots=True)
class MockInplayPoller:
    fixture_internal_id: int
    poll_seconds: float
    sleep: SleepFn = asyncio.sleep

    async def run(self) -> None:
        log.info("ingest.mock_poller.start", fixture_id=self.fixture_internal_id)
        try:
            while True:
                log.info(
                    "ingest.mock_poller.heartbeat",
                    fixture_id=self.fixture_internal_id,
                    poll_seconds=self.poll_seconds,
                )
                await self.sleep(self.poll_seconds)
        except asyncio.CancelledError:
            log.info("ingest.mock_poller.stop", fixture_id=self.fixture_internal_id)
            raise


@dataclass(slots=True)
class MockPollerFactory:
    poll_seconds: float

    def create_inplay(self, fixture_internal_id: int) -> Poller:
        return MockInplayPoller(
            fixture_internal_id=fixture_internal_id,
            poll_seconds=self.poll_seconds,
        )
