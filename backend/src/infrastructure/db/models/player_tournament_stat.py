"""PlayerTournamentStatORM — persistence Adapter for tournament stats."""

from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base
from src.infrastructure.db.models._mixins import AuditMixin


class PlayerTournamentStatORM(Base, AuditMixin):
    __tablename__ = "player_tournament_stat"
    __table_args__ = (
        UniqueConstraint("sportmonks_statistic_id", name="ux_player_tournament_stat_sportmonks"),
        {"schema": "core"},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sportmonks_statistic_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("core.player.id", ondelete="CASCADE"), index=True)
    season_id: Mapped[int] = mapped_column(BigInteger, index=True)

    appearances: Mapped[int | None]
    minutes_played: Mapped[int | None]
    goals: Mapped[int | None]
    assists: Mapped[int | None]
    yellow_cards: Mapped[int | None]
    red_cards: Mapped[int | None]
    shots_total: Mapped[int | None]
    shots_on_target: Mapped[int | None]
    key_passes: Mapped[int | None]
    rating_avg: Mapped[float | None] = mapped_column(Numeric(precision=4, scale=2))
    raw_stats: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
