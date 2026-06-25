"""In-app announcements (release notes / messages) with per-user acknowledgement.

Lets an admin push a message to users without a deploy (INSERT into
``app.announcement``). Each signed-in user sees an active announcement once: when
they dismiss it ("Got it"), an ``app.announcement_ack`` row is written and the
read endpoint stops returning it for that user — across devices, since it is
keyed on the account, not the browser. Shown to signed-in users only.

Revision ID: 0041
Revises: 0040
Create Date: 2026-06-25

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0041"
down_revision: str | Sequence[str] | None = "0040"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "announcement",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=16), server_default="info", nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="app",
    )
    op.create_table(
        "announcement_ack",
        sa.Column("announcement_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("acked_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["announcement_id"], ["app.announcement.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["app.user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("announcement_id", "user_id"),
        schema="app",
    )


def downgrade() -> None:
    op.drop_table("announcement_ack", schema="app")
    op.drop_table("announcement", schema="app")
