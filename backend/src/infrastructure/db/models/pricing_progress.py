"""PricingProgressORM — incremental-pricing watermark (single row)."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, SmallInteger, text
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class PricingProgressORM(Base):
    __tablename__ = "pricing_progress"
    __table_args__ = (
        CheckConstraint("singleton = 1", name="ck_pricing_progress_singleton"),
        {"schema": "valuation"},
    )

    singleton: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    last_event_id: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        nullable=False,
    )
