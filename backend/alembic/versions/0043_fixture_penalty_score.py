"""Penalty-shootout score on a fixture (who won a match decided on penalties).

Adds ``core.fixture.home_pen_score`` / ``away_pen_score`` (nullable ints): the
converted-penalty count per side from the Sportmonks PENALTY_SHOOTOUT score
block. Both NULL unless the knockout was decided on penalties; their presence is
what tells the UI the match ended on penalties, and the winner is the higher of
the two. Additive + backward-compatible.

Revision ID: 0043
Revises: 0042
Create Date: 2026-06-30

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0043"
down_revision: str | Sequence[str] | None = "0042"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("fixture", sa.Column("home_pen_score", sa.Integer(), nullable=True), schema="core")
    op.add_column("fixture", sa.Column("away_pen_score", sa.Integer(), nullable=True), schema="core")


def downgrade() -> None:
    op.drop_column("fixture", "away_pen_score", schema="core")
    op.drop_column("fixture", "home_pen_score", schema="core")
