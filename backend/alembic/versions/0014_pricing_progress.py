"""valuation.pricing_progress — incremental-pricing watermark

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-12

Single-row table holding the highest ``core.match_event.id`` the live
pricing worker has already turned into price ticks. Updated in the
same transaction as the ticks it produces, so a crash mid-batch
never double-counts: on restart the worker resumes from the last
committed watermark.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0014"
down_revision: str | Sequence[str] | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pricing_progress",
        sa.Column("singleton", sa.SmallInteger(), nullable=False),
        sa.Column("last_event_id", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("singleton = 1", name="ck_pricing_progress_singleton"),
        sa.PrimaryKeyConstraint("singleton"),
        schema="valuation",
    )
    # Seed the single row.
    op.execute("INSERT INTO valuation.pricing_progress (singleton, last_event_id) VALUES (1, 0)")


def downgrade() -> None:
    op.drop_table("pricing_progress", schema="valuation")
