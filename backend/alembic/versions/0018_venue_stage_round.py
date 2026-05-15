"""core.venue + core.fixture stage/round/venue enrichment.

Revision ID: 0018
Revises: 0017
Create Date: 2026-05-14

Creates ``core.venue`` (sportmonks-sourced stadiums) and adds three
columns to ``core.fixture``: ``venue_id`` (FK), ``stage_name`` and
``round_name``. The trio lets us tag every fixture with its tournament
phase ("Group Stage" + round "1/2/3", or "Round of 16", "Final", etc.)
and surface the stadium name in the UI.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0018"
down_revision: str | Sequence[str] | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "venue",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("sportmonks_id", sa.Integer(), unique=True, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("city", sa.String(80), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=True),
        schema="core",
    )
    op.add_column(
        "fixture",
        sa.Column(
            "venue_id",
            sa.Integer(),
            sa.ForeignKey("core.venue.id", ondelete="SET NULL"),
            nullable=True,
        ),
        schema="core",
    )
    op.add_column("fixture", sa.Column("stage_name", sa.String(60), nullable=True), schema="core")
    op.add_column("fixture", sa.Column("round_name", sa.String(60), nullable=True), schema="core")


def downgrade() -> None:
    op.drop_column("fixture", "round_name", schema="core")
    op.drop_column("fixture", "stage_name", schema="core")
    op.drop_column("fixture", "venue_id", schema="core")
    op.drop_table("venue", schema="core")
