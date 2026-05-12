"""StandingORM — persistence adapter for group-stage standings."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, SmallInteger, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class StandingORM(Base):
    __tablename__ = "standings"
    __table_args__ = (
        UniqueConstraint("team_id", name="ux_standings_team"),
        {"schema": "core"},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    team_id: Mapped[str] = mapped_column(ForeignKey("core.team.id", ondelete="CASCADE"), index=True)
    group: Mapped[str] = mapped_column(String(8), index=True)
    position: Mapped[int] = mapped_column(SmallInteger)
    played: Mapped[int] = mapped_column(SmallInteger, default=0)
    won: Mapped[int] = mapped_column(SmallInteger, default=0)
    drawn: Mapped[int] = mapped_column(SmallInteger, default=0)
    lost: Mapped[int] = mapped_column(SmallInteger, default=0)
    goals_for: Mapped[int] = mapped_column(SmallInteger, default=0)
    goals_against: Mapped[int] = mapped_column(SmallInteger, default=0)
    goal_difference: Mapped[int] = mapped_column(SmallInteger, default=0)
    points: Mapped[int] = mapped_column(SmallInteger, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        nullable=False,
    )
