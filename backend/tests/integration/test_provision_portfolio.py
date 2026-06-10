"""Integration tests for portfolio provisioning (the 1-user-1-portfolio invariant).

Uses the rollback-isolated session; the no-commit paths leave the DB untouched.
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.provision_portfolio import get_or_create_portfolio, provision_portfolio
from src.config import get_settings
from src.infrastructure.db.models.user import UserORM


@pytest.mark.anyio
async def test_provision_creates_portfolio_with_starter_cash(isolated_session: AsyncSession) -> None:
    user = UserORM(name=f"_prov_{id(isolated_session)}", kind="human")
    isolated_session.add(user)
    await isolated_session.flush()

    portfolio = await provision_portfolio(isolated_session, user.id)

    assert portfolio.user_id == user.id
    assert portfolio.cash == get_settings().initial_cash


@pytest.mark.anyio
async def test_get_or_create_returns_the_existing_portfolio(isolated_session: AsyncSession) -> None:
    # A user who already has a portfolio must get THAT one back — never a second
    # (the UNIQUE(user_id) constraint backs the "one and only one" invariant).
    user = UserORM(name=f"_goc_{id(isolated_session)}", kind="human")
    isolated_session.add(user)
    await isolated_session.flush()
    created = await provision_portfolio(isolated_session, user.id)

    resolved = await get_or_create_portfolio(isolated_session, user.id)

    assert resolved.id == created.id
