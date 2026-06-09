"""PasswordResetORM — app.password_reset.

One row per issued reset token. Stores the SHA-256 digest of the token
(never the raw value), its expiry, and a ``used_at`` stamp that makes the
token single-use. Rows are short-lived by design; a periodic cleanup of
expired rows is a maintenance concern, not a correctness one (lookups
always re-check ``expires_at`` and ``used_at``).
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class PasswordResetORM(Base):
    __tablename__ = "password_reset"
    __table_args__ = {"schema": "app"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("app.user.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # SHA-256 hex digest of the raw token (64 chars). Unique so a digest
    # collision (impossible in practice) can never resolve to two rows.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
