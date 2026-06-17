"""PortfolioValueSnapshotORM — adapter for ``valuation.portfolio_value_snapshot``.

DDD role: Adapter (persistence). Maps the ``PortfolioSnapshot`` value
object onto the bucketed hypertable. The PK is ``(portfolio_id, ts)``
where ``ts`` is the minute-bucket key produced by the application layer.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, PrimaryKeyConstraint
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class PortfolioValueSnapshotORM(Base):
    __tablename__ = "portfolio_value_snapshot"
    __table_args__ = (
        PrimaryKeyConstraint("portfolio_id", "ts"),
        {"schema": "valuation"},
    )

    portfolio_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("app.portfolio.id", ondelete="CASCADE")
    )
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Scale 6 — same precision ladder as app.portfolio.cash / app.trade.total, so
    # a snapshot's value reconciles with cash + sum(shares * mark) exactly and the
    # history curve carries no rounding residual. Rounded only at display. See 0038.
    cash: Mapped[float] = mapped_column(Numeric(18, 6))
    holdings_value: Mapped[float] = mapped_column(Numeric(18, 6))
    value: Mapped[float] = mapped_column(Numeric(18, 6))
    pnl_vs_open: Mapped[float] = mapped_column(Numeric(18, 6))
