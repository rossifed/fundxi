"""CLI worker: ingest lineups + structured events for every WC2022 fixture.

Run via:
    uv run python -m src.infrastructure.workers.bootstrap_fixture_details
"""

import asyncio
import logging
import sys

import structlog

from src.application.bootstrap_fixture_details import (
    FixtureDetailsReport,
    bootstrap_fixture_details,
)
from src.config import get_settings
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.lineup import SqlAlchemyLineupRepository
from src.infrastructure.db.repositories.match_event import SqlAlchemyMatchEventRepository
from src.infrastructure.db.repositories.raw_sportmonks_event import SqlAlchemyRawSportmonksEventRepository
from src.infrastructure.db.session import SessionLocal
from src.infrastructure.sportmonks.client import HttpxSportmonksClient

log = structlog.get_logger(__name__)


def _configure_logging(level: str) -> None:
    logging.basicConfig(level=level.upper(), format="%(message)s")
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )


async def run() -> FixtureDetailsReport:
    settings = get_settings()
    _configure_logging(settings.log_level)
    if not settings.sportmonks_api_token:
        raise SystemExit("SPORTMONKS_API_TOKEN not set")

    async with (
        HttpxSportmonksClient(
            base_url=settings.sportmonks_base_url, api_token=settings.sportmonks_api_token
        ) as client,
        SessionLocal() as session,
    ):
        report = await bootstrap_fixture_details(
            session=session,
            client=client,
            raw_archive=SqlAlchemyRawSportmonksEventRepository(session),
            fixture_repo=SqlAlchemyFixtureRepository(session),
            lineup_repo=SqlAlchemyLineupRepository(session),
            event_repo=SqlAlchemyMatchEventRepository(session),
        )
        await session.commit()
    log.info(
        "bootstrap_fixture_details.cli_done",
        fixtures=report.fixtures,
        lineups=report.lineups,
        events=report.events,
        skipped=report.skipped,
    )
    return report


def main() -> None:
    try:
        asyncio.run(run())
    except SystemExit as exc:
        print(f"bootstrap_fixture_details aborted: {exc}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
