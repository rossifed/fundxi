"""PortfolioORM + HoldingORM + TradeORM."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, PrimaryKeyConstraint, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class PortfolioORM(Base):
    __tablename__ = "portfolio"
    __table_args__ = {"schema": "app"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("app.user.id", ondelete="CASCADE"), unique=True, index=True)
    # Scale 6: cash must absorb `shares` (4 dp) * `price` (2 dp) = up to 6 dp
    # without rounding, so the cash charged equals the position's mark exactly
    # (no account-level residual). Money is rounded only at display. See 0038.
    cash: Mapped[float] = mapped_column(Numeric(18, 6))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class HoldingORM(Base):
    __tablename__ = "holding"
    __table_args__ = (
        PrimaryKeyConstraint("portfolio_id", "player_id"),
        {"schema": "app"},
    )

    # PK (portfolio_id, player_id) already serves portfolio_id-prefix lookups
    # (and the cascade): no standalone portfolio_id index (see migration 0029).
    # player_id keeps its index — that's the reverse lookup "who holds X".
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("app.portfolio.id", ondelete="CASCADE"))
    player_id: Mapped[int] = mapped_column(ForeignKey("core.player.id", ondelete="CASCADE"), index=True)
    shares: Mapped[float] = mapped_column(Numeric(12, 4))
    average_buy_price: Mapped[float] = mapped_column(Numeric(10, 2))


class TradeORM(Base):
    __tablename__ = "trade"
    # Idempotency: at most one trade per (portfolio, key). NULL keys are exempt
    # (Postgres treats NULLs as distinct), so the legacy no-key path keeps
    # appending freely while keyed submissions dedupe.
    __table_args__ = (
        UniqueConstraint("portfolio_id", "idempotency_key", name="uq_trade_portfolio_idempotency_key"),
        {"schema": "app"},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("app.portfolio.id", ondelete="CASCADE"), index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("core.player.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(8))
    shares: Mapped[float] = mapped_column(Numeric(12, 4))
    price: Mapped[float] = mapped_column(Numeric(10, 2))
    # Scale 6: total = shares (4 dp) * price (2 dp) is stored exactly, so the
    # cash movement reconciles with the position value to the cent. See 0038.
    total: Mapped[float] = mapped_column(Numeric(18, 6))
    executed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    idempotency_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
