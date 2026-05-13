"""LineupORM — persistence Adapter for Lineup."""

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base
from src.infrastructure.db.models._mixins import AuditMixin


class LineupORM(Base, AuditMixin):
    __tablename__ = "lineup"
    __table_args__ = {"schema": "core"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sportmonks_id: Mapped[int] = mapped_column(unique=True, index=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("core.fixture.id", ondelete="CASCADE"), index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("core.player.id", ondelete="CASCADE"), index=True)
    team_id: Mapped[str] = mapped_column(ForeignKey("core.team.id", ondelete="RESTRICT"), index=True)
    role: Mapped[str] = mapped_column(String(8))  # starter | bench
    position: Mapped[str] = mapped_column(String(4))
    jersey_number: Mapped[int | None]
    formation_position: Mapped[int | None]
    # Sportmonks "row:col" tactical grid coordinate (e.g. "2:3"). Null for
    # bench players or fixtures where the source did not provide it.
    formation_field: Mapped[str | None] = mapped_column(String(8), nullable=True)
