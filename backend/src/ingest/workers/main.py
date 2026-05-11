"""Ingest daemon entry point.

DDD role: Adapter (driving). Wires concrete adapters and runs the
supervisor until interrupted. Étape A wires **mock pollers** so we
can verify the orchestration end-to-end without yet hitting
Sportmonks. Étape B will replace ``MockPollerFactory`` with the real
HTTP-driven factory.

Run with:
    uv run python -m src.ingest.workers.main
"""

import asyncio
import contextlib
import logging
import signal

import structlog

from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.session import SessionLocal
from src.ingest.application.supervisor import IngestSupervisor
from src.ingest.domain.settings import IngestionSettings
from src.ingest.infrastructure.mock_pollers import MockPollerFactory
from src.ingest.infrastructure.nats_publisher import NatsPublisher
from src.ingest.infrastructure.system_clock import SystemClock

log = structlog.get_logger(__name__)


def _configure_logging() -> None:
    logging.basicConfig(level="INFO", format="%(message)s")
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )


async def run() -> None:
    _configure_logging()
    settings = IngestionSettings()
    log.info(
        "ingest.daemon.start",
        inplay_poll_seconds=settings.inplay_poll_seconds,
        scheduler_check_seconds=settings.scheduler_check_seconds,
        max_concurrent=settings.max_concurrent_inplay_pollers,
        nats_servers=settings.nats_server_list,
    )

    async with (
        SessionLocal() as session,
        NatsPublisher(servers=settings.nats_server_list) as _publisher,
    ):
        # ``_publisher`` will be consumed by the real poller factory in
        # étape B.2; for B.1 we only validate its lifecycle (connect on
        # entry, drain on exit) is sound.
        fixtures_repo = SqlAlchemyFixtureRepository(session)
        supervisor = IngestSupervisor(
            settings=settings,
            fixtures=fixtures_repo,
            factory=MockPollerFactory(poll_seconds=settings.inplay_poll_seconds),
            clock=SystemClock(),
            sleep=asyncio.sleep,
        )

        stop_signal = asyncio.Event()

        def _request_stop() -> None:
            log.info("ingest.daemon.stop_signal")
            stop_signal.set()

        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, _request_stop)

        supervisor_task = asyncio.create_task(supervisor.run(), name="ingest-supervisor")
        await stop_signal.wait()
        supervisor_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await supervisor_task

    log.info("ingest.daemon.stopped")


def main() -> int:
    asyncio.run(run())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
