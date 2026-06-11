"""NewsORM — persistence Adapter for News.

DDD role: Adapter.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base
from src.infrastructure.db.models._mixins import AuditMixin


class NewsORM(Base, AuditMixin):
    __tablename__ = "news"
    __table_args__ = {"schema": "core"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sportmonks_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    fixture_id: Mapped[int | None] = mapped_column(ForeignKey("core.fixture.id", ondelete="SET NULL"), index=True)
    league_id: Mapped[int | None]
    title: Mapped[str] = mapped_column(String(512))
    type: Mapped[str] = mapped_column(String(16), index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
