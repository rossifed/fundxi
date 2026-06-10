"""PlayerPriceTickORM — output of the valuation engine, hypertable on `ts`.

DDD role: Adapter (persistence). Each row = one re-evaluation of a player's
price triggered by an event or a daily close.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, PrimaryKeyConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class PlayerPriceTickORM(Base):
    __tablename__ = "player_price_tick"
    __table_args__ = (
        PrimaryKeyConstraint("player_id", "ts"),
        {"schema": "valuation"},
    )

    # No standalone index: the PK (player_id, ts) already serves player_id-
    # prefix lookups and the FK cascade. A separate player_id index is pure
    # write overhead (see migration 0029).
    player_id: Mapped[int] = mapped_column(ForeignKey("core.player.id", ondelete="CASCADE"))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    fixture_id: Mapped[int | None] = mapped_column(ForeignKey("core.fixture.id", ondelete="SET NULL"))
    current_price: Mapped[float] = mapped_column(Numeric(10, 2))
    performance_rating: Mapped[float] = mapped_column(Numeric(4, 2))
    source: Mapped[str] = mapped_column(String(16))
