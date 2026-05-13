"""core.fixture — per-match kit colors (home/away).

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-13

Adds four nullable columns to ``core.fixture`` to record the actual kit
colors worn by each team for that specific match. Sourced from
Sportmonks fixture metadata (``include=metadata``, type_id 161/162):
``values.participant`` is the primary kit color (hex), ``values.kit``
is the raw CSV palette for the full strip (shirt / shorts / socks /
GK / variants — kept as-is for the frontend to use later if needed).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0015"
down_revision: str | Sequence[str] | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("fixture", sa.Column("home_kit_color", sa.String(7), nullable=True), schema="core")
    op.add_column("fixture", sa.Column("away_kit_color", sa.String(7), nullable=True), schema="core")
    op.add_column("fixture", sa.Column("home_kit_palette", sa.String(255), nullable=True), schema="core")
    op.add_column("fixture", sa.Column("away_kit_palette", sa.String(255), nullable=True), schema="core")


def downgrade() -> None:
    op.drop_column("fixture", "away_kit_palette", schema="core")
    op.drop_column("fixture", "home_kit_palette", schema="core")
    op.drop_column("fixture", "away_kit_color", schema="core")
    op.drop_column("fixture", "home_kit_color", schema="core")
