"""CLI: clear simulation state before a new replay.

DDD role: Adapter (driving). Wires the SQLAlchemy executor to the
use case and owns the session/transaction boundary.

Usage:
    uv run python -m src.simulation.cli.wipe            # data-only (default)
    uv run python -m src.simulation.cli.wipe --full     # also wipes portfolio
"""

import argparse
import asyncio
import logging

import structlog

from src.infrastructure.db.session import SessionLocal
from src.simulation.application.wipe_replay_state import wipe_replay_state
from src.simulation.domain.wipe_scope import WipeScope
from src.simulation.infrastructure.pg_wipe_executor import SqlAlchemyWipeExecutor

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


async def run(scope: WipeScope) -> None:
    _configure_logging()
    log.info("simulation.wipe.start", scope=scope.value)
    async with SessionLocal() as session:
        executor = SqlAlchemyWipeExecutor(session=session)
        await wipe_replay_state(executor, scope)
        await session.commit()
    log.info("simulation.wipe.done", scope=scope.value)
    if scope is WipeScope.FULL:
        log.info(
            "simulation.wipe.hint",
            message="Run `uv run python -m src.infrastructure.workers.bootstrap_user` "
            "to re-create the default portfolio.",
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Wipe simulation state for replay")
    parser.add_argument(
        "--full",
        action="store_true",
        help="Also wipe portfolio, holdings and trades. Default: simulation data only.",
    )
    args = parser.parse_args()
    scope = WipeScope.FULL if args.full else WipeScope.DATA_ONLY
    asyncio.run(run(scope))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
