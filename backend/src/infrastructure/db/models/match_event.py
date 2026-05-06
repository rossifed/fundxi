"""MatchEventORM — persistence Adapter for structured per-player events."""

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base
from src.infrastructure.db.models._mixins import AuditMixin


class MatchEventORM(Base, AuditMixin):
    __tablename__ = "match_event"
    __table_args__ = (
        Index("ix_core_match_event_fixture_sequence", "fixture_id", "sequence"),
        Index("ix_core_match_event_player_id", "player_id"),
        {"schema": "core"},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sportmonks_id: Mapped[int] = mapped_column(unique=True, index=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("core.fixture.id", ondelete="CASCADE"), index=True)
    minute: Mapped[int]
    extra_minute: Mapped[int | None]
    type: Mapped[str] = mapped_column(String(24), index=True)
    player_id: Mapped[int | None] = mapped_column(ForeignKey("core.player.id", ondelete="SET NULL"))
    related_player_id: Mapped[int | None] = mapped_column(ForeignKey("core.player.id", ondelete="SET NULL"))
    team_id: Mapped[str | None] = mapped_column(ForeignKey("core.team.id", ondelete="SET NULL"))
    info: Mapped[str | None] = mapped_column(String(255))
    sequence: Mapped[int]
