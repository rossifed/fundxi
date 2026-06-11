"""Integration tests for trade idempotency against the REAL DB.

The unit suite (tests/unit/test_place_trade.py) covers the replay LOGIC with
fakes. This file verifies the SQL backstop that guarantees the side effect
happens at most once even if the application check is bypassed:

  1. ``get_by_idempotency_key`` round-trips the stored key.
  2. The ``UNIQUE (portfolio_id, idempotency_key)`` constraint rejects a second
     trade carrying the same key.
  3. A NULL key is exempt (the legacy non-idempotent path keeps appending).

Isolation: every test rolls back at teardown (repos use ``flush()``).
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.portfolio.portfolio import Trade, TradeKind
from src.infrastructure.db.models.user import UserORM
from src.infrastructure.db.repositories.portfolio import (
    SqlAlchemyPortfolioRepository,
    SqlAlchemyTradeRepository,
)


async def _player_id(session: AsyncSession) -> int:
    row = (await session.execute(text("SELECT id FROM core.player ORDER BY id LIMIT 1"))).first()
    if row is None:  # pragma: no cover
        pytest.skip("core.player is empty — bootstrap WC data first")
    return int(row[0])


async def _setup(session: AsyncSession) -> tuple[int, int]:
    user = UserORM(name=f"_idem_test_{id(session)}", kind="human")
    session.add(user)
    await session.flush()
    portfolio = await SqlAlchemyPortfolioRepository(session).create_for_user(user_id=user.id, cash=100.0)
    return portfolio.id, await _player_id(session)


def _trade(portfolio_id: int, player_id: int, key: str | None) -> Trade:
    return Trade(
        id=0,
        portfolio_id=portfolio_id,
        player_id=player_id,
        kind=TradeKind.BUY,
        shares=1.0,
        price=10.0,
        total=10.0,
        executed_at=None,  # type: ignore[arg-type]  # server_default fills it
        idempotency_key=key,
    )


@pytest.mark.anyio
async def test_get_by_idempotency_key_round_trips(isolated_session: AsyncSession) -> None:
    portfolio_id, player_id = await _setup(isolated_session)
    trade_repo = SqlAlchemyTradeRepository(isolated_session)

    saved = await trade_repo.append(_trade(portfolio_id, player_id, "key-rt"))
    await isolated_session.flush()

    found = await trade_repo.get_by_idempotency_key(portfolio_id=portfolio_id, idempotency_key="key-rt")
    assert found is not None
    assert found.id == saved.id
    assert found.idempotency_key == "key-rt"
    # An unseen key resolves to None.
    assert await trade_repo.get_by_idempotency_key(portfolio_id=portfolio_id, idempotency_key="nope") is None


@pytest.mark.anyio
async def test_duplicate_key_violates_unique_constraint(isolated_session: AsyncSession) -> None:
    portfolio_id, player_id = await _setup(isolated_session)
    trade_repo = SqlAlchemyTradeRepository(isolated_session)

    await trade_repo.append(_trade(portfolio_id, player_id, "dup"))
    await isolated_session.flush()
    with pytest.raises(IntegrityError):
        await trade_repo.append(_trade(portfolio_id, player_id, "dup"))
        await isolated_session.flush()


@pytest.mark.anyio
async def test_null_keys_are_exempt_from_the_constraint(isolated_session: AsyncSession) -> None:
    portfolio_id, player_id = await _setup(isolated_session)
    trade_repo = SqlAlchemyTradeRepository(isolated_session)

    # Two no-key trades coexist — Postgres treats NULLs as distinct.
    await trade_repo.append(_trade(portfolio_id, player_id, None))
    await trade_repo.append(_trade(portfolio_id, player_id, None))
    await isolated_session.flush()
    trades = await trade_repo.list_by_portfolio(portfolio_id)
    assert len([t for t in trades if t.idempotency_key is None]) == 2
