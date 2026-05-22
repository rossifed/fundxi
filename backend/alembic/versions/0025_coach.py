"""core.coach + core.team.coach_id.

Revision ID: 0025
Revises: 0024
Create Date: 2026-05-22

Creates ``core.coach`` (Sportmonks-sourced head coaches) and adds a
nullable ``coach_id`` FK to ``core.team`` so the team page can surface
the head coach. Mirrors the ``core.venue`` reference-table pattern.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0025"
down_revision: str | Sequence[str] | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "coach",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("sportmonks_id", sa.Integer(), unique=True, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("image_path", sa.String(255), nullable=True),
        sa.Column("nationality_name", sa.String(80), nullable=True),
        sa.Column("nationality_iso", sa.String(8), nullable=True),
        schema="core",
    )
    op.add_column(
        "team",
        sa.Column(
            "coach_id",
            sa.Integer(),
            sa.ForeignKey("core.coach.id", ondelete="SET NULL"),
            nullable=True,
        ),
        schema="core",
    )


def downgrade() -> None:
    op.drop_column("team", "coach_id", schema="core")
    op.drop_table("coach", schema="core")
