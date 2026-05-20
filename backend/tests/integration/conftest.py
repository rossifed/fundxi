"""Shared integration-test fixtures.

The default ``SessionLocal`` engine pools connections; with multiple
async test files in the same session, a connection from a previous
test's (now-closed) event loop can leak into the next test and raise
``Event loop is closed`` on the next session creation. Using a
``NullPool`` engine here means every session opens a fresh connection
and disposes it at the end — no cross-test contamination.

``isolated_session`` is the single function-scope async fixture both
test files use (test_trade_db.py, test_coherence.py). It opens a
session, yields it, and rolls back at teardown for zero DB pollution
(the repos use ``flush()``, not ``commit()``, so rollback wipes
everything they did).
"""

from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.config import get_settings


async def _db_is_up(maker: async_sessionmaker[AsyncSession]) -> bool:
    try:
        async with maker() as session:
            await session.execute(text("SELECT 1"))
        return True
    except (OperationalError, ConnectionRefusedError, OSError):
        return False


@pytest.fixture
async def isolated_session() -> AsyncIterator[AsyncSession]:
    """A session with a per-test connection (NullPool) that rolls back
    at teardown. Zero DB pollution; no event-loop leakage between
    async test files."""
    engine = create_async_engine(get_settings().database_url, poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    try:
        if not await _db_is_up(maker):
            pytest.skip("local Postgres not reachable")
        async with maker() as session:
            try:
                yield session
            finally:
                await session.rollback()
    finally:
        await engine.dispose()
