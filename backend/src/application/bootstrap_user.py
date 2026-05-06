"""Bootstrap a default human user + portfolio if none exists yet.

Idempotent — running this twice does not create a second user.
"""

from dataclasses import dataclass

import structlog

from src.domain.portfolio.portfolio import Portfolio, PortfolioRepository
from src.domain.portfolio.user import User, UserKind, UserRepository

log = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class BootstrapUserReport:
    user: User
    portfolio: Portfolio
    created: bool


async def ensure_default_user(
    *,
    user_repo: UserRepository,
    portfolio_repo: PortfolioRepository,
    initial_cash: float,
) -> BootstrapUserReport:
    if initial_cash <= 0:
        raise SystemExit("INITIAL_CASH not set or non-positive (must be > 0).")

    existing = await user_repo.get_default_human()
    if existing is not None:
        portfolio = await portfolio_repo.get_by_user_id(existing.id)
        if portfolio is None:
            portfolio = await portfolio_repo.create_for_user(user_id=existing.id, cash=initial_cash)
            log.info("bootstrap_user.portfolio_repaired", user_id=existing.id, cash=initial_cash)
            return BootstrapUserReport(user=existing, portfolio=portfolio, created=True)
        return BootstrapUserReport(user=existing, portfolio=portfolio, created=False)

    user = await user_repo.create(name="me", kind=UserKind.HUMAN)
    portfolio = await portfolio_repo.create_for_user(user_id=user.id, cash=initial_cash)
    log.info("bootstrap_user.created", user_id=user.id, cash=initial_cash)
    return BootstrapUserReport(user=user, portfolio=portfolio, created=True)
