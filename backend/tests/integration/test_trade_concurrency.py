"""Concurrency test for the portfolio row lock — against the REAL DB.

The unit/integration trade tests run single-threaded, so they never exercise
the ``FOR UPDATE`` lock taken in ``place_trade``. A lock can only be tested for
real: two transactions racing on the SAME portfolio row. This test fires two
concurrent ``place_trade`` BUYs on one portfolio and asserts cash is debited
twice (no lost update). Without the lock the two read-modify-writes would race
and one debit would be lost (final cash 99 instead of 98).

Each leg buys 0.1 of the player (ownership fraction), NOT the whole player:
``shares`` is the ownership fraction (1.0 = 100% of the player), and a position
may never exceed the player cap (``MAX_OWNERSHIP_FRACTION`` = 1). Two whole-player
buys would (correctly) trip the cap on the second leg, which would mask the lock
behaviour we want to assert here.

Unlike the other integration files this one COMMITS (the lock is only released
at commit, and the second transaction must observe the first's committed
state), so it seeds throwaway rows and deletes them in a ``finally``.
"""

import asyncio
from datetime import UTC, datetime

import pytest
from sqlalchemy import delete, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.application.place_trade import PlaceTradeCommand, place_trade
from src.config import get_settings
from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM
from src.infrastructure.db.models.portfolio import HoldingORM, PortfolioORM, TradeORM
from src.infrastructure.db.models.user import UserORM
from src.infrastructure.db.repositories.portfolio import (
    SqlAlchemyPortfolioRepository,
    SqlAlchemyTradeRepository,
)
from src.infrastructure.db.repositories.portfolio_snapshot_adapters import SqlAlchemyLatestPriceProvider
from src.infrastructure.db.repositories.user import SqlAlchemyUserRepository
from src.infrastructure.valuation.db_or_synthetic_starting_price_provider import (
    DbOrSyntheticStartingPriceProvider,
)


@pytest.mark.anyio
async def test_concurrent_trades_serialize_on_portfolio_row_lock() -> None:
    engine = create_async_engine(get_settings().database_url, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def _buy_once(uid: int, pid: int) -> None:
        """One BUY in its own transaction, mirroring a single HTTP request."""
        async with maker() as session:
            await place_trade(
                command=PlaceTradeCommand(user_id=uid, player_id=pid, kind="buy", shares=0.1),
                user_repo=SqlAlchemyUserRepository(session),
                portfolio_repo=SqlAlchemyPortfolioRepository(session),
                trade_repo=SqlAlchemyTradeRepository(session),
                price_provider=SqlAlchemyLatestPriceProvider(session),
                starting_price_provider=DbOrSyntheticStartingPriceProvider(session, as_of=datetime.now(UTC)),
                max_leverage=1.0,
            )
            await session.commit()

    user_id: int | None = None
    player_id: int | None = None
    portfolio_id: int | None = None
    try:
        # --- seed (committed so both concurrent sessions can see it) ---
        async with maker() as s:
            try:
                await s.execute(text("SELECT 1"))
            except (OperationalError, ConnectionRefusedError, OSError):
                pytest.skip("local Postgres not reachable")

            row = (await s.execute(text("SELECT id FROM core.player ORDER BY id LIMIT 1"))).first()
            if row is None:  # pragma: no cover — needs bootstrapped players
                pytest.skip("core.player is empty — bootstrap WC data first")
            player_id = int(row[0])

            user = UserORM(name=f"_lock_test_{id(engine)}", kind="human")
            s.add(user)
            await s.flush()
            user_id = user.id
            portfolio = await SqlAlchemyPortfolioRepository(s).create_for_user(user_id=user.id, cash=100.0)
            portfolio_id = portfolio.id
            s.add(
                PlayerPriceTickORM(
                    player_id=player_id,
                    ts=datetime.now(UTC),
                    fixture_id=None,
                    current_price=10.0,
                    performance_rating=7.0,
                    source="engine",
                )
            )
            await s.commit()

        # --- race: two BUYs of 0.1 of the player @ 10 on the same portfolio ---
        assert user_id is not None and player_id is not None
        await asyncio.gather(_buy_once(user_id, player_id), _buy_once(user_id, player_id))

        # --- assert: both debits applied (no lost update) ---
        async with maker() as s:
            final = await SqlAlchemyPortfolioRepository(s).get_by_user_id(user_id)
            assert final is not None
            # 100 - 2*(0.1*10) = 98. A lost update would leave 99.
            assert final.cash == 98.0
    finally:
        # cleanup the throwaway rows regardless of outcome
        async with maker() as s:
            if portfolio_id is not None:
                await s.execute(delete(TradeORM).where(TradeORM.portfolio_id == portfolio_id))
                await s.execute(delete(HoldingORM).where(HoldingORM.portfolio_id == portfolio_id))
                await s.execute(delete(PortfolioORM).where(PortfolioORM.id == portfolio_id))
            if player_id is not None:
                await s.execute(delete(PlayerPriceTickORM).where(PlayerPriceTickORM.player_id == player_id))
            if user_id is not None:
                await s.execute(delete(UserORM).where(UserORM.id == user_id))
            await s.commit()
        await engine.dispose()
