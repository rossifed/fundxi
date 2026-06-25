"""ActivityEventORM — append-only user-activity log (app opens, logins, signups).

DDD role: Adapter (behaviour signal sink). One row per meaningful event captured
server-side: ``open`` (every /api/auth/me load — authenticated OR anonymous),
``login``, ``register``. ``user_id`` is NULL for an anonymous open. Append-only,
written best-effort off the request path (FastAPI background task) so it can never
break a response. No IP (PII); only a coarse user-agent string.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class ActivityEventORM(Base):
    __tablename__ = "activity_event"
    __table_args__ = (
        Index("ix_app_activity_event_user_ts", "user_id", "ts"),
        Index("ix_app_activity_event_kind_ts", "kind", "ts"),
        {"schema": "app"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # NULL = anonymous (not signed in). SET NULL on user delete keeps the event.
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("app.user.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(16))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
