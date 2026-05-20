"""SqlAlchemy adapter for ``PortfolioSnapshotRepository``.

DDD role: Adapter (driven). Implements the read/write contract on the
``valuation.portfolio_value_snapshot`` hypertable.

Write path uses Postgres ``INSERT ... ON CONFLICT (portfolio_id, ts)
DO UPDATE`` — within a single minute-bucket multiple ticks collapse to
one row (the last write wins). This is the central property that
bounds the write volume independently of tick rate.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.portfolio.portfolio_snapshot import PortfolioSnapshot
from src.infrastructure.db.models.portfolio_value_snapshot import PortfolioValueSnapshotORM


def _to_domain(orm: PortfolioValueSnapshotORM) -> PortfolioSnapshot:
    return PortfolioSnapshot(
        portfolio_id=orm.portfolio_id,
        ts=orm.ts,
        cash=float(orm.cash),
        holdings_value=float(orm.holdings_value),
        value=float(orm.value),
        pnl_vs_open=float(orm.pnl_vs_open),
    )


_UPSERT_COLUMNS = ("cash", "holdings_value", "value", "pnl_vs_open")


class SqlAlchemyPortfolioSnapshotRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(self, snapshot: PortfolioSnapshot) -> None:
        await self.upsert_many([snapshot])

    async def upsert_many(self, snapshots: list[PortfolioSnapshot]) -> None:
        if not snapshots:
            return
        rows = [
            {
                "portfolio_id": s.portfolio_id,
                "ts": s.ts,
                "cash": s.cash,
                "holdings_value": s.holdings_value,
                "value": s.value,
                "pnl_vs_open": s.pnl_vs_open,
            }
            for s in snapshots
        ]
        stmt = pg_insert(PortfolioValueSnapshotORM).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["portfolio_id", "ts"],
            set_={col: stmt.excluded[col] for col in _UPSERT_COLUMNS},
        )
        await self._session.execute(stmt)

    async def list_range(
        self,
        *,
        portfolio_id: int,
        since: datetime | None,
        until: datetime | None,
    ) -> list[PortfolioSnapshot]:
        stmt = select(PortfolioValueSnapshotORM).where(
            PortfolioValueSnapshotORM.portfolio_id == portfolio_id
        )
        if since is not None:
            stmt = stmt.where(PortfolioValueSnapshotORM.ts >= since)
        if until is not None:
            stmt = stmt.where(PortfolioValueSnapshotORM.ts <= until)
        stmt = stmt.order_by(PortfolioValueSnapshotORM.ts)
        result = await self._session.execute(stmt)
        return [_to_domain(row) for row in result.scalars().all()]

    async def get_open_value(self, portfolio_id: int) -> float | None:
        stmt = (
            select(PortfolioValueSnapshotORM.value)
            .where(PortfolioValueSnapshotORM.portfolio_id == portfolio_id)
            .order_by(PortfolioValueSnapshotORM.ts)
            .limit(1)
        )
        result = await self._session.execute(stmt)
        row = result.scalar_one_or_none()
        return float(row) if row is not None else None
