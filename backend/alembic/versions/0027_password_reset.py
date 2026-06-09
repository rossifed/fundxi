"""app.password_reset + app.user.password_changed_at — password-reset flow.

Revision ID: 0027
Revises: 0026
Create Date: 2026-06-08

Adds the storage for the "forgot password" flow:

- ``app.password_reset`` — one row per issued reset token. Stores only the
  SHA-256 digest of the token (never the raw value), its expiry and a
  ``used_at`` stamp that makes it single-use. ``token_hash`` is unique so a
  presented token resolves to at most one row.
- ``app.user.password_changed_at`` — bumped on every password reset. A
  session JWT whose ``iat`` predates this stamp is rejected, so resetting a
  password invalidates all previously issued sessions.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0027"
down_revision: str | Sequence[str] | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user", sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True), schema="app"
    )
    op.create_table(
        "password_reset",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["app.user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_app_password_reset_token_hash"),
        schema="app",
    )
    op.create_index(
        "ix_app_password_reset_user_id", "password_reset", ["user_id"], schema="app"
    )


def downgrade() -> None:
    op.drop_index("ix_app_password_reset_user_id", table_name="password_reset", schema="app")
    op.drop_table("password_reset", schema="app")
    op.drop_column("user", "password_changed_at", schema="app")
