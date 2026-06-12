"""PlayerMatchStatORM — persistence adapter for per-match player stats.

Mirrors ``PlayerTournamentStatORM`` but keyed by ``(player_id,
fixture_id)`` instead of ``(player_id, season_id)``. Populated by the
live ingest poller as it observes Sportmonks' running per-match
statistics under the ``?include=lineups.statistics`` projection.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class PlayerMatchStatORM(Base):
    __tablename__ = "player_match_stat"
    __table_args__ = (
        UniqueConstraint("player_id", "fixture_id", name="ux_player_match_stat_player_fixture"),
        {"schema": "core"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("core.player.id", ondelete="CASCADE"), index=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("core.fixture.id", ondelete="CASCADE"), index=True)

    minutes_played: Mapped[int | None]
    shots_total: Mapped[int | None]
    shots_on_target: Mapped[int | None]
    goals: Mapped[int | None]
    assists: Mapped[int | None]
    yellow_cards: Mapped[int | None]
    red_cards: Mapped[int | None]
    key_passes: Mapped[int | None]
    passes_total: Mapped[int | None]
    passes_accuracy: Mapped[float | None] = mapped_column(Numeric(precision=5, scale=2))
    rating: Mapped[float | None] = mapped_column(Numeric(precision=4, scale=2))
    # Expected Goals (Sportmonks type_id 5304), e.g. 0.6849.
    xg: Mapped[float | None] = mapped_column(Numeric(precision=6, scale=4))
    raw_details: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        nullable=False,
    )
