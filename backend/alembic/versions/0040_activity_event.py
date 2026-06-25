"""Lightweight user-activity log: app opens, logins, signups (auth + anonymous).

No session/login tracking existed (JWT is stateless). This adds an append-only
``app.activity_event`` capturing meaningful behaviour signals server-side, with
zero frontend change: ``/api/auth/me`` (hit on every app load, authenticated OR
anonymous) records an ``open``; ``/login`` and ``/register`` record their event.
``user_id`` is NULL for anonymous opens. Enough to derive returns/sessions/
last-seen and anonymous traffic. No IP stored (PII); only a coarse user-agent.

Revision ID: 0040
Revises: 0039
Create Date: 2026-06-25

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0040"
down_revision: str | Sequence[str] | None = "0039"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "activity_event",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("user_agent", sa.String(length=300), nullable=True),
        sa.Column("ts", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["app.user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        schema="app",
    )
    op.create_index("ix_app_activity_event_user_ts", "activity_event", ["user_id", "ts"], schema="app")
    op.create_index("ix_app_activity_event_kind_ts", "activity_event", ["kind", "ts"], schema="app")


def downgrade() -> None:
    op.drop_index("ix_app_activity_event_kind_ts", table_name="activity_event", schema="app")
    op.drop_index("ix_app_activity_event_user_ts", table_name="activity_event", schema="app")
    op.drop_table("activity_event", schema="app")
