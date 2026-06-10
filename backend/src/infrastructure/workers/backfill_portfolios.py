"""Worker: backfill a starter portfolio for any user missing one.

DDD role: Adapter (driving). One-time (idempotent, re-runnable) repair enforcing the
"1 user = 1 portfolio" invariant for users created before auto-provisioning. New
users get a portfolio at registration; this closes the gap for legacy accounts.

Run:  uv run python -m src.infrastructure.workers.backfill_portfolios
"""

import asyncio
import logging

import structlog
from sqlalchemy import select

from src.application.provision_portfolio import provision_portfolio
from src.infrastructure.db.models.user import UserORM
from src.infrastructure.db.repositories.portfolio import SqlAlchemyPortfolioRepository
from src.infrastructure.db.session import SessionLocal

log = structlog.get_logger(__name__)


async def run() -> None:
    logging.basicConfig(level="INFO", format="%(message)s")
    structlog.configure(processors=[structlog.processors.add_log_level, structlog.dev.ConsoleRenderer()])
    async with SessionLocal() as session:
        repo = SqlAlchemyPortfolioRepository(session)
        user_ids = list((await session.execute(select(UserORM.id))).scalars().all())
        created = 0
        for user_id in user_ids:
            if await repo.get_by_user_id(user_id) is None:
                await provision_portfolio(session, user_id)
                created += 1
        await session.commit()
    log.info("backfill.portfolios.done", users=len(user_ids), created=created)


if __name__ == "__main__":
    asyncio.run(run())
