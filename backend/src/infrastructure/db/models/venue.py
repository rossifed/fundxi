"""VenueORM — persistence Adapter for the Venue Entity.

DDD role: Adapter. Sportmonks-sourced stadium reference data: name,
city, capacity. Referenced by ``FixtureORM.venue_id``.
"""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class VenueORM(Base):
    __tablename__ = "venue"
    __table_args__ = {"schema": "core"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sportmonks_id: Mapped[int | None] = mapped_column(unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    city: Mapped[str | None] = mapped_column(String(80))
    capacity: Mapped[int | None]
