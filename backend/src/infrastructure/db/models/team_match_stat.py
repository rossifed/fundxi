"""TeamMatchStatORM — persistence adapter for per-team, per-fixture stats.

Wide-flexible: one row per (fixture, team, type_code). Populated by the
live ingest poller and by ``bootstrap_fixture_details``.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class TeamMatchStatORM(Base):
    __tablename__ = "team_match_stat"
    __table_args__ = (
        UniqueConstraint("fixture_id", "team_id", "type_code", name="ux_team_match_stat_fixture_team_type"),
        {"schema": "core"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("core.fixture.id", ondelete="CASCADE"), index=True)
    team_id: Mapped[str] = mapped_column(String(8), ForeignKey("core.team.id", ondelete="CASCADE"))
    type_code: Mapped[str] = mapped_column(String(64))
    value: Mapped[Decimal | None] = mapped_column(Numeric(precision=10, scale=2))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        nullable=False,
    )
