"""Integration tests for the portfolio snapshot path against the REAL DB.

Verifies the SQL behaviour the unit tests can't capture:
- Bucket-keyed UPSERT collapses two ticks in the same minute → one row.
- Range read filters correctly on the hypertable.
- ``PortfolioHistoryService`` returns the bucketed history + a live
  tail point appended at the current minute.

Each test rolls back at teardown via the shared ``isolated_session``
fixture, so the suite leaves the DB exactly as it found it.
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.portfolio_history_service import (
    HistoryRange,
    PortfolioHistoryService,
)
from src.application.portfolio_snapshot_service import PortfolioSnapshotService
from src.infrastructure.db.models.portfolio import HoldingORM, PortfolioORM
from src.infrastructure.db.models.portfolio_value_snapshot import PortfolioValueSnapshotORM
from src.infrastructure.db.models.user import UserORM
from src.infrastructure.db.repositories.portfolio import SqlAlchemyPortfolioRepository
from src.infrastructure.db.repositories.portfolio_snapshot import (
    SqlAlchemyPortfolioSnapshotRepository,
)
from src.infrastructure.db.repositories.portfolio_snapshot_adapters import (
    SqlAlchemyLatestPriceProvider,
    SqlAlchemyPortfolioReader,
)


async def _player_id(session: AsyncSession) -> int:
    row = (await session.execute(text("SELECT id FROM core.player ORDER BY id LIMIT 1"))).first()
    if row is None:  # pragma: no cover
        pytest.skip("core.player is empty — bootstrap WC data first")
    return int(row[0])


async def _make_portfolio(session: AsyncSession, cash: float = 100.0) -> int:
    user = UserORM(name=f"_pvs_test_{id(session)}", kind="human")
    session.add(user)
    await session.flush()
    portfolio = PortfolioORM(user_id=user.id, cash=cash)
    session.add(portfolio)
    await session.flush()
    return portfolio.id


@pytest.mark.anyio
async def test_minute_bucket_upsert_collapses_two_ticks(isolated_session: AsyncSession) -> None:
    """Two ticks 30s apart in the same minute → one row (last value wins)."""
    pid = await _make_portfolio(isolated_session, cash=50.0)
    player_id = await _player_id(isolated_session)
    isolated_session.add(
        HoldingORM(portfolio_id=pid, player_id=player_id, shares=10.0, average_buy_price=1.0)
    )
    await isolated_session.flush()

    service = PortfolioSnapshotService.from_session(isolated_session)

    # First "tick": we don't actually write a player_price_tick row,
    # we just call materialize with the player_id — the adapter will
    # fall back to ``average_buy_price`` (no tick = no price). That
    # exercises the bucket-collapse behaviour without depending on the
    # valuation engine state.
    base_ts = datetime(2026, 5, 20, 14, 23, 10, tzinfo=UTC)
    await service.materialize_for_player_ticks(ticked_player_ids=[player_id], ts=base_ts)
    await service.materialize_for_player_ticks(
        ticked_player_ids=[player_id], ts=base_ts.replace(second=50)
    )

    rows = (
        await isolated_session.execute(
            select(PortfolioValueSnapshotORM).where(PortfolioValueSnapshotORM.portfolio_id == pid)
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].ts == base_ts.replace(second=0, microsecond=0)


@pytest.mark.anyio
async def test_history_endpoint_returns_buckets_in_order(isolated_session: AsyncSession) -> None:
    """Seed three buckets across two days, GET ``range=7d`` returns all
    of them in chronological order, plus a live tail at the current
    minute."""
    pid = await _make_portfolio(isolated_session, cash=100.0)
    base = datetime.now(UTC).replace(second=0, microsecond=0)
    seed = [
        (base - timedelta(hours=10), 100.0),
        (base - timedelta(hours=5), 110.0),
        (base - timedelta(hours=1), 130.0),
    ]
    for ts, value in seed:
        isolated_session.add(
            PortfolioValueSnapshotORM(
                portfolio_id=pid, ts=ts,
                cash=100.0, holdings_value=value - 100.0,
                value=value, pnl_vs_open=value - 100.0,
            )
        )
    await isolated_session.flush()

    service = PortfolioHistoryService(
        portfolio_repo=SqlAlchemyPortfolioRepository(isolated_session),
        snapshot_repo=SqlAlchemyPortfolioSnapshotRepository(isolated_session),
        price_provider=SqlAlchemyLatestPriceProvider(isolated_session),
        portfolio_reader=SqlAlchemyPortfolioReader(isolated_session),
    )
    points = await service.read(portfolio_id=pid, range_=HistoryRange.LAST_7D)

    # 3 seeded + 1 live tail (no holdings ⇒ live = cash only = 100).
    assert len(points) == 4
    # Chronological order preserved.
    timestamps = [p.ts for p in points]
    assert timestamps == sorted(timestamps)
    # The first persisted value is reflected.
    assert points[0].value == 100.0
    # The third persisted value is reflected.
    assert points[2].value == 130.0
