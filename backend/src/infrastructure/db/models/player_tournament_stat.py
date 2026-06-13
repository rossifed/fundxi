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
    passes_total: Mapped[int | None]
    passes_accuracy: Mapped[float | None] = mapped_column(Numeric(precision=5, scale=2))
    rating_avg: Mapped[float | None] = mapped_column(Numeric(precision=4, scale=2))
    # Enriched stat set (Sportmonks player.statistics, verified type_ids).
    shots_off_target: Mapped[int | None]
    offsides: Mapped[int | None]
    big_chances_created: Mapped[int | None]
    big_chances_missed: Mapped[int | None]
    accurate_passes: Mapped[int | None]
    crosses_total: Mapped[int | None]
    crosses_accurate: Mapped[int | None]
    long_balls: Mapped[int | None]
    through_balls: Mapped[int | None]
    dribble_attempts: Mapped[int | None]
    dribbles_completed: Mapped[int | None]
    dispossessed: Mapped[int | None]
    dribbled_past: Mapped[int | None]
    fouls_drawn: Mapped[int | None]
    tackles: Mapped[int | None]
    interceptions: Mapped[int | None]
    clearances: Mapped[int | None]
    total_duels: Mapped[int | None]
    duels_won: Mapped[int | None]
    aerials_won: Mapped[int | None]
    shots_blocked: Mapped[int | None]
    errors_leading_to_goal: Mapped[int | None]
    fouls: Mapped[int | None]
    own_goals: Mapped[int | None]
    saves: Mapped[int | None]
    goals_conceded: Mapped[int | None]
    clean_sheets: Mapped[int | None]
    raw_stats: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
