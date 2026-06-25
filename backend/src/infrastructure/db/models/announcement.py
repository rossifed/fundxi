"""AnnouncementORM + AnnouncementAckORM — in-app messages & per-user read state.

DDD role: Adapters. ``announcement`` holds the pushed messages (release notes /
news); ``announcement_ack`` records which signed-in user dismissed which message
(PK = (announcement_id, user_id)) so it is shown exactly once per account, across
devices.
"""

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class AnnouncementORM(Base):
    __tablename__ = "announcement"
    __table_args__ = {"schema": "app"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(16), server_default="info")
    active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AnnouncementAckORM(Base):
    __tablename__ = "announcement_ack"
    __table_args__ = {"schema": "app"}

    announcement_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("app.announcement.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("app.user.id", ondelete="CASCADE"), primary_key=True)
    acked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
