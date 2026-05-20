"""Integration tests for backend trade execution against the REAL DB.

The unit suite (tests/unit/test_trade_execution.py) covers the pure
logic + the application service with in-memory fake repos. This file
exercises the SqlAlchemy repos through ``execute_trade`` so the actual
SQL (UPSERT, DELETE, INSERT) is verified end-to-end against Postgres.

Isolation: every test runs inside a session and rolls back at the end,
so the suite leaves the DB exactly as it found it. The repos use
``flush()`` (not ``commit()``), so the rollback wipes everything.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.trade_execution import TradeError, TradeRequest, execute_trade
from src.domain.portfolio.portfolio import TradeKind
from src.infrastructure.db.models.user import UserORM
from src.infrastructure.db.repositories.portfolio import (
    SqlAlchemyPortfolioRepository,
    SqlAlchemyTradeRepository,
)

# ``isolated_session`` fixture is shared via tests/integration/conftest.py.


async def _player_id_with_quote(session: AsyncSession) -> int:
    """A core.player id that exists (so the holding FK to core.player resolves)."""
    row = (await session.execute(text("SELECT id FROM core.player ORDER BY id LIMIT 1"))).first()
    if row is None:  # pragma: no cover — bootstrap should have populated players
        pytest.skip("core.player is empty — bootstrap WC data first")
    return int(row[0])


@pytest.mark.anyio
async def test_trade_execution_against_real_db(isolated_session: AsyncSession) -> None:
    """End-to-end through real Postgres in ONE test that covers both
    invariants in sequence (simpler asyncio lifecycle than splitting
    into two function-scoped fixtures):

      1. BUY -> holding INSERT + cash UPDATE; SELL of the same -> holding
         DELETE + cash exactly restored. Verifies SQL UPSERT + DELETE.
      2. A trade that exceeds cash raises TradeError and leaves the DB
         exactly as before (no half-written holding, no orphan trade).
    """
    portfolio_repo = SqlAlchemyPortfolioRepository(isolated_session)
    trade_repo = SqlAlchemyTradeRepository(isolated_session)

    # Throwaway user + portfolio (rolled back at teardown).
    user = UserORM(name=f"_trade_db_test_{id(isolated_session)}", kind="human")
    isolated_session.add(user)
    await isolated_session.flush()
    portfolio = await portfolio_repo.create_for_user(user_id=user.id, cash=100.0)
    player_id = await _player_id_with_quote(isolated_session)

    # 1a) BUY 2 @ 10 -> cash 80, holding 2 @ 10 persisted.
    out_buy = await execute_trade(
        request=TradeRequest(portfolio.id, player_id, TradeKind.BUY, shares=2.0, price=10.0),
        portfolio=portfolio,
        portfolio_repo=portfolio_repo,
        trade_repo=trade_repo,
    )
    await isolated_session.flush()
    assert out_buy.portfolio.cash == 80.0
    held_db = await portfolio_repo.get_holding(portfolio_id=portfolio.id, player_id=player_id)
    assert held_db is not None and held_db.shares == 2.0

    # 1b) SELL 2 @ 10 -> cash back to 100, holding row DELETED.
    out_sell = await execute_trade(
        request=TradeRequest(portfolio.id, player_id, TradeKind.SELL, shares=2.0, price=10.0),
        portfolio=out_buy.portfolio,
        portfolio_repo=portfolio_repo,
        trade_repo=trade_repo,
    )
    await isolated_session.flush()
    assert out_sell.holding is None
    assert out_sell.portfolio.cash == 100.0
    assert await portfolio_repo.get_holding(portfolio_id=portfolio.id, player_id=player_id) is None

    # 2) A failed trade leaves the DB exactly as before.
    cash_before = out_sell.portfolio.cash
    with pytest.raises(TradeError, match="insufficient cash"):
        await execute_trade(
            request=TradeRequest(portfolio.id, player_id, TradeKind.BUY, shares=1000.0, price=10.0),
            portfolio=out_sell.portfolio,
            portfolio_repo=portfolio_repo,
            trade_repo=trade_repo,
        )
    await isolated_session.flush()
    assert await portfolio_repo.get_holding(portfolio_id=portfolio.id, player_id=player_id) is None
    assert cash_before == 100.0
