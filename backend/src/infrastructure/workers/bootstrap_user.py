"""CLI worker: create the default human user + portfolio if missing.

Run via:
    uv run python -m src.infrastructure.workers.bootstrap_user
"""

import asyncio
import logging

import structlog

from src.application.bootstrap_user import BootstrapUserReport, ensure_default_user
from src.config import get_settings
from src.infrastructure.db.repositories.portfolio import SqlAlchemyPortfolioRepository
from src.infrastructure.db.repositories.user import SqlAlchemyUserRepository
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


async def run() -> BootstrapUserReport:
    settings = get_settings()
    _configure_logging(settings.log_level)
    async with SessionLocal() as session:
        report = await ensure_default_user(
            user_repo=SqlAlchemyUserRepository(session),
            portfolio_repo=SqlAlchemyPortfolioRepository(session),
            initial_cash=settings.initial_cash,
        )
        await session.commit()
    log.info(
        "bootstrap_user.cli_done",
        user_id=report.user.id,
        portfolio_id=report.portfolio.id,
        cash=report.portfolio.cash,
        created=report.created,
    )
    return report


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
