"""MatchCommentPlayerMentionORM — pure association adapter.

DDD role: Adapter. Many-to-many join between match_comment and player. Not
exposed as a domain entity because there's no behaviour beyond the link
itself.
"""

from sqlalchemy import ForeignKey, PrimaryKeyConstraint
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class MatchCommentPlayerMentionORM(Base):
    __tablename__ = "match_comment_player_mention"
    __table_args__ = (
        PrimaryKeyConstraint("match_comment_id", "player_id"),
        {"schema": "core"},
    )

    match_comment_id: Mapped[int] = mapped_column(ForeignKey("core.match_comment.id", ondelete="CASCADE"), index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("core.player.id", ondelete="CASCADE"), index=True)
