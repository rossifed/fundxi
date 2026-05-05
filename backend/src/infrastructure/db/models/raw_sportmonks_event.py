"""RawSportmonksEventORM — audit log of every Sportmonks API call.

DDD role: Adapter (raw payload sink). Idempotent on (endpoint, response_hash):
re-running a worker that hits the same endpoint with the same response is a
no-op. Lets us rebuild core.* by replaying raw without paying Sportmonks again.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class RawSportmonksEventORM(Base):
    __tablename__ = "sportmonks_event"
    __table_args__ = (
        UniqueConstraint("endpoint", "response_hash", name="uq_raw_sportmonks_event_endpoint_hash"),
        {"schema": "raw"},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    endpoint: Mapped[str] = mapped_column(String(255), index=True)
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    response: Mapped[dict[str, Any]] = mapped_column(JSONB)
    response_hash: Mapped[str] = mapped_column(String(64))
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
