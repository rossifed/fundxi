"""CLI worker: backfill stage / round labels onto fixtures.

Surgical companion to ``bootstrap_fixture_details`` — fetches ONLY the
``stage`` / ``round`` includes per fixture and writes the two phase
columns, so the knockout bracket view has data to render.

Run via:
    uv run python -m src.infrastructure.workers.backfill_fixture_phase
    uv run python -m src.infrastructure.workers.backfill_fixture_phase --season-id 18017
"""

import argparse
import asyncio
import logging
import sys

import structlog

from src.application.backfill_fixture_phase import FixturePhaseReport, backfill_fixture_phase
from src.config import get_settings
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
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


async def run(*, season_id: int | None) -> FixturePhaseReport:
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
        report = await backfill_fixture_phase(
            session=session,
            client=client,
            raw_archive=SqlAlchemyRawSportmonksEventRepository(session),
            fixture_repo=SqlAlchemyFixtureRepository(session),
            season_id=season_id,
        )
        await session.commit()
    log.info(
        "backfill_fixture_phase.cli_done",
        fixtures_seen=report.fixtures_seen,
        updated=report.updated,
        skipped_no_phase=report.skipped_no_phase,
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill fixture stage / round labels")
    parser.add_argument(
        "--season-id",
        type=int,
        default=None,
        help="Restrict to one Sportmonks season id (default: all fixtures)",
    )
    args = parser.parse_args()
    try:
        asyncio.run(run(season_id=args.season_id))
    except SystemExit as exc:
        print(f"backfill_fixture_phase aborted: {exc}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
