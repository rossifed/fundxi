"""TeamORM — persistence Adapter for the Team Aggregate Root.

DDD role: Adapter (Repository implementation detail), not a domain entity.
Translation to/from `domain.team.Team` happens in the Repository.
"""

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base
from src.infrastructure.db.models._mixins import AuditMixin


class TeamORM(Base, AuditMixin):
    __tablename__ = "team"
    __table_args__ = {"schema": "core"}

    id: Mapped[str] = mapped_column(String(8), primary_key=True)
    sportmonks_id: Mapped[int | None] = mapped_column(unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    # Sportmonks returns image URLs (~70 chars) for `flag`; emoji-only mode
    # is a frontend display concern (ISO code → emoji is a 2-line transform).
    flag: Mapped[str] = mapped_column(String(255))
    color: Mapped[str] = mapped_column(String(16))
    kind: Mapped[str] = mapped_column(String(16))
    confederation: Mapped[str | None] = mapped_column(String(16))
    group: Mapped[str | None] = mapped_column(String(8))
    # Head coach — FK to the core.coach reference table, nullable (a team
    # may be ingested before its coach include lands).
    coach_id: Mapped[int | None] = mapped_column(
        ForeignKey("core.coach.id", ondelete="SET NULL"), nullable=True
    )
