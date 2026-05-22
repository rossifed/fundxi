"""CoachORM — persistence Adapter for the Coach Entity.

DDD role: Adapter. Sportmonks-sourced coach reference data: name, image,
nationality. Referenced by ``TeamORM.coach_id``. Mirrors ``VenueORM`` —
a small reference table keyed on ``sportmonks_id``.
"""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class CoachORM(Base):
    __tablename__ = "coach"
    __table_args__ = {"schema": "core"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sportmonks_id: Mapped[int | None] = mapped_column(unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    image_path: Mapped[str | None] = mapped_column(String(255))
    nationality_name: Mapped[str | None] = mapped_column(String(80))
    nationality_iso: Mapped[str | None] = mapped_column(String(8))
