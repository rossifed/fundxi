"""Portfolio provisioning — the "1 user = 1 portfolio" invariant.

DDD role: Application Service. Each user owns exactly one starter portfolio
(cash = ``initial_cash``) plus its opening value snapshot. "At most one" is already
enforced by the ``UNIQUE(user_id)`` constraint on ``app.portfolio``; these helpers
enforce "at least one" — at registration AND, self-healingly, on first read for
legacy users created before auto-provisioning existed.
"""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.portfolio_snapshot_service import PortfolioSnapshotService
from src.config import get_settings
from src.domain.portfolio.portfolio import Portfolio
from src.infrastructure.db.repositories.portfolio import SqlAlchemyPortfolioRepository


async def provision_portfolio(session: AsyncSession, user_id: int) -> Portfolio:
    """Create the user's starter portfolio + its opening snapshot.

    Does NOT commit — the caller owns the transaction (registration commits it
    atomically with the user row)."""
    repo = SqlAlchemyPortfolioRepository(session)
    portfolio = await repo.create_for_user(user_id=user_id, cash=get_settings().initial_cash)
    await PortfolioSnapshotService.from_session(session).bootstrap(portfolio.id, opened_at=portfolio.created_at)
    return portfolio


async def get_or_create_portfolio(session: AsyncSession, user_id: int) -> Portfolio:
    """Return the user's portfolio, creating it on first access if missing.

    Self-heals users registered before auto-provisioning. Race-safe via the
    ``UNIQUE(user_id)`` constraint: a concurrent create loses the insert, and we
    re-read the winner. Commits a freshly-created portfolio (the caller's read may
    not own a write transaction)."""
    repo = SqlAlchemyPortfolioRepository(session)
    existing = await repo.get_by_user_id(user_id)
    if existing is not None:
        return existing
    try:
        portfolio = await provision_portfolio(session, user_id)
        await session.commit()
        return portfolio
    except IntegrityError:
        await session.rollback()
        portfolio = await repo.get_by_user_id(user_id)
        if portfolio is None:  # pragma: no cover — the conflicting row must exist
            raise
        return portfolio
