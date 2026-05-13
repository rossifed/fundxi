"""core.fixture — per-match formation (home/away).

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-13

Adds two nullable VARCHAR columns to ``core.fixture`` to record the
formation each team played in that fixture (e.g. "4-3-3", "4-2-3-1").
Sourced from Sportmonks fixture metadata (type_id 159) or from the
``formations`` include — both carry the same string.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016"
down_revision: str | Sequence[str] | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("fixture", sa.Column("home_formation", sa.String(16), nullable=True), schema="core")
    op.add_column("fixture", sa.Column("away_formation", sa.String(16), nullable=True), schema="core")


def downgrade() -> None:
    op.drop_column("fixture", "away_formation", schema="core")
    op.drop_column("fixture", "home_formation", schema="core")
