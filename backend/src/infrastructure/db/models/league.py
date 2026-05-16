"""LeagueORM + LeagueMemberORM — app.league, app.league_member.

The GLOBAL league is a single seeded row (kind='global', no invite code,
no creator). Every user is an explicit member row in league_member —
including for GLOBAL (auto-joined at registration), so the leaderboard is
a single uniform query regardless of league kind.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, PrimaryKeyConstraint, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class LeagueORM(Base):
    __tablename__ = "league"
    __table_args__ = {"schema": "app"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(16), index=True)
    invite_code: Mapped[str | None] = mapped_column(String(16), unique=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("app.user.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class LeagueMemberORM(Base):
    __tablename__ = "league_member"
    __table_args__ = (
        PrimaryKeyConstraint("league_id", "user_id"),
        {"schema": "app"},
    )

    league_id: Mapped[int] = mapped_column(ForeignKey("app.league.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("app.user.id", ondelete="CASCADE"), index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
