"""PlayerDailySnapshotORM — one row per player per day (open/close/change_24h)."""

from datetime import date as _date

from sqlalchemy import Date, ForeignKey, Numeric, PrimaryKeyConstraint
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class PlayerDailySnapshotORM(Base):
    __tablename__ = "player_daily_snapshot"
    __table_args__ = (
        PrimaryKeyConstraint("player_id", "date"),
        {"schema": "valuation"},
    )

    # PK (player_id, date) already covers player_id-prefix lookups + the FK
    # cascade; no standalone player_id index (see migration 0029).
    player_id: Mapped[int] = mapped_column(ForeignKey("core.player.id", ondelete="CASCADE"))
    date: Mapped[_date] = mapped_column(Date)
    open_price: Mapped[float] = mapped_column(Numeric(10, 2))
    close_price: Mapped[float] = mapped_column(Numeric(10, 2))
    change_24h: Mapped[float] = mapped_column(Numeric(6, 2))
