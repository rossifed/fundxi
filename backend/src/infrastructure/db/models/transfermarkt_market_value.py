"""TransfermarktMarketValueORM — raw archive of scraped Transfermarkt market values.

DDD role: Adapter (raw payload sink). One row per Transfermarkt player, carrying
their squad market value as scraped from the WC2026 participant pages. This is the
auditable, re-runnable seed source for ``core.player.base_value``; the matching
step reads it (our players ↔ TM by team + normalised name) and never the live site.

Upsert on ``tm_player_id`` (PK): re-scraping the same snapshot is idempotent and a
fresh snapshot overwrites the value (last-write-wins).
"""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class TransfermarktMarketValueORM(Base):
    __tablename__ = "transfermarkt_market_value"
    __table_args__ = {"schema": "raw"}

    tm_player_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    player_slug: Mapped[str | None] = mapped_column(String(255))
    player_name: Mapped[str | None] = mapped_column(String(255))
    team_slug: Mapped[str | None] = mapped_column(String(128))
    # English team name (from the index ``title`` attr) — the bridge to our
    # English-named core.team for the matching step (TM slugs are German).
    team_name: Mapped[str | None] = mapped_column(String(128))
    team_verein_id: Mapped[int | None]
    market_value_m: Mapped[Decimal] = mapped_column(Numeric(8, 3))
    currency: Mapped[str] = mapped_column(String(3), server_default="EUR")
    snapshot_date: Mapped[date] = mapped_column(Date)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
