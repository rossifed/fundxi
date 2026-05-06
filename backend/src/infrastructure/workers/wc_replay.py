"""CLI worker: replay the active tournament's events through the v0 pricing
engine and rebuild valuation.player_price_tick + player_daily_snapshot.

Run via:
    uv run python -m src.infrastructure.workers.wc_replay
"""

import asyncio
import logging
import sys

import structlog

from src.application.wc_replay import ReplayReport, replay_tournament
from src.config import get_settings
from src.infrastructure.db.session import SessionLocal

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


async def run() -> ReplayReport:
    _configure_logging(get_settings().log_level)
    async with SessionLocal() as session:
        report = await replay_tournament(session=session)
        await session.commit()
    log.info(
        "wc_replay.cli_done",
        fixtures=report.fixtures,
        ticks=report.ticks,
        snapshots=report.snapshots,
        impacted_players=report.impacted_players,
    )
    return report


def main() -> None:
    try:
        asyncio.run(run())
    except SystemExit as exc:
        print(f"wc_replay aborted: {exc}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
