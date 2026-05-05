"""FixtureORM — persistence Adapter for the Fixture Aggregate Root.

DDD role: Adapter. Domain ↔ ORM translation is the Repository's job.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base
from src.infrastructure.db.models._mixins import AuditMixin


class FixtureORM(Base, AuditMixin):
    __tablename__ = "fixture"
    __table_args__ = {"schema": "core"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sportmonks_id: Mapped[int | None] = mapped_column(unique=True, index=True)
    home_team_id: Mapped[str] = mapped_column(ForeignKey("core.team.id", ondelete="RESTRICT"), index=True)
    away_team_id: Mapped[str] = mapped_column(ForeignKey("core.team.id", ondelete="RESTRICT"), index=True)
    status: Mapped[str] = mapped_column(String(16), index=True)
    group: Mapped[str] = mapped_column(String(8), index=True)
    home_score: Mapped[int | None]
    away_score: Mapped[int | None]
    kickoff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    minute: Mapped[int | None]
    note: Mapped[str | None] = mapped_column(Text)
