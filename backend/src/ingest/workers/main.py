"""Ingest daemon entry point.

DDD role: Adapter (driving). Wires concrete adapters (Sportmonks
client, NATS publisher, real poller factory) and runs the supervisor
until interrupted.

Run with:
    uv run python -m src.ingest.workers.main
"""

import asyncio
import contextlib
import logging
import signal

import structlog

from src.config import get_settings as get_app_settings
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.session import SessionLocal
from src.infrastructure.sportmonks.client import HttpxSportmonksClient
from src.ingest.application.supervisor import IngestSupervisor
from src.ingest.domain.settings import IngestionSettings
from src.ingest.infrastructure.nats_publisher import NatsPublisher
from src.ingest.infrastructure.sportmonks_id_maps import load_sportmonks_id_maps
from src.ingest.infrastructure.sportmonks_poller_factory import SportmonksPollerFactory
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
    ingest_settings = IngestionSettings()
    app_settings = get_app_settings()
    if not app_settings.sportmonks_api_token:
        raise SystemExit("SPORTMONKS_API_TOKEN not set in environment / .env")

    log.info(
        "ingest.daemon.start",
        inplay_poll_seconds=ingest_settings.inplay_poll_seconds,
        scheduler_check_seconds=ingest_settings.scheduler_check_seconds,
        max_concurrent=ingest_settings.max_concurrent_inplay_pollers,
        nats_servers=ingest_settings.nats_server_list,
    )

    async with (
        HttpxSportmonksClient(
            base_url=app_settings.sportmonks_base_url,
            api_token=app_settings.sportmonks_api_token,
        ) as sportmonks_client,
        NatsPublisher(servers=ingest_settings.nats_server_list) as publisher,
        SessionLocal() as supervisor_session,
    ):
        id_maps = await load_sportmonks_id_maps(supervisor_session)
        log.info(
            "ingest.daemon.id_maps_loaded",
            fixtures=len(id_maps.fixture_smk_by_internal),
            players=len(id_maps.player_id_by_sportmonks),
            teams=len(id_maps.team_id_by_sportmonks),
        )

        factory = SportmonksPollerFactory(
            settings=ingest_settings,
            client=sportmonks_client,
            publisher=publisher,
            session_factory=SessionLocal,
            id_maps=id_maps,
        )

        supervisor = IngestSupervisor(
            settings=ingest_settings,
            fixtures=SqlAlchemyFixtureRepository(supervisor_session),
            factory=factory,
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
