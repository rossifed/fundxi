"""MatchCommentORM — persistence Adapter for per-minute match commentaries.

DDD role: Adapter. Sequence column = Sportmonks `order`. Ordered playback uses
the (fixture_id, sequence) index.
"""

from sqlalchemy import BigInteger, Boolean, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base
from src.infrastructure.db.models._mixins import AuditMixin


class MatchCommentORM(Base, AuditMixin):
    __tablename__ = "match_comment"
    __table_args__ = (
        Index("ix_core_match_comment_fixture_sequence", "fixture_id", "sequence"),
        {"schema": "core"},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sportmonks_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("core.fixture.id", ondelete="CASCADE"), index=True)
    minute: Mapped[int]
    extra_minute: Mapped[int | None]
    comment: Mapped[str] = mapped_column(Text)
    is_goal: Mapped[bool] = mapped_column(Boolean, server_default="false")
    is_important: Mapped[bool] = mapped_column(Boolean, server_default="false")
    sequence: Mapped[int]
