"""PortfolioORM + HoldingORM + TradeORM."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, PrimaryKeyConstraint, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class PortfolioORM(Base):
    __tablename__ = "portfolio"
    __table_args__ = {"schema": "app"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("app.user.id", ondelete="CASCADE"), unique=True, index=True)
    cash: Mapped[float] = mapped_column(Numeric(12, 2))
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

    portfolio_id: Mapped[int] = mapped_column(ForeignKey("app.portfolio.id", ondelete="CASCADE"), index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("core.player.id", ondelete="CASCADE"), index=True)
    shares: Mapped[float] = mapped_column(Numeric(12, 4))
    average_buy_price: Mapped[float] = mapped_column(Numeric(10, 2))


class TradeORM(Base):
    __tablename__ = "trade"
    __table_args__ = {"schema": "app"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("app.portfolio.id", ondelete="CASCADE"), index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("core.player.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(8))
    shares: Mapped[float] = mapped_column(Numeric(12, 4))
    price: Mapped[float] = mapped_column(Numeric(10, 2))
    total: Mapped[float] = mapped_column(Numeric(12, 2))
    executed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
