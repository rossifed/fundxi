"""PlayerORM — persistence Adapter for the Player Aggregate Root.

DDD role: Adapter. Domain ↔ ORM translation is the Repository's job.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base
from src.infrastructure.db.models._mixins import AuditMixin


class PlayerORM(Base, AuditMixin):
    __tablename__ = "player"
    __table_args__ = {"schema": "core"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sportmonks_id: Mapped[int | None] = mapped_column(unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    jersey_number: Mapped[int]
    team_id: Mapped[str] = mapped_column(ForeignKey("core.team.id", ondelete="RESTRICT"), index=True)
    position: Mapped[str] = mapped_column(String(4))
    full_name: Mapped[str | None] = mapped_column(String(255))
    age: Mapped[int | None]
    foot: Mapped[str | None] = mapped_column(String(8))
    height: Mapped[int | None]
    weight: Mapped[int | None]
    club: Mapped[str | None] = mapped_column(String(128))
    bio: Mapped[str | None] = mapped_column(Text)
    image_path: Mapped[str | None] = mapped_column(String(255))
    detailed_position: Mapped[str | None] = mapped_column(String(64))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    birth_city: Mapped[str | None] = mapped_column(String(128))
    nationality_name: Mapped[str | None] = mapped_column(String(64))
    nationality_iso: Mapped[str | None] = mapped_column(String(8))
    nationality_flag_url: Mapped[str | None] = mapped_column(String(255))
    # Pricing anchor: pre-tournament starting price (t0) of the player instrument,
    # set once from a real market-value snapshot. NULL → no anchor → price shows
    # "—" (never synthesised in prod). ``base_value_source`` records provenance
    # ('transfermarkt' | 'derived') and must never be 'synthetic' in prod.
    base_value: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    base_value_source: Mapped[str | None] = mapped_column(String(16))
