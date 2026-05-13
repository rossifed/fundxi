"""core.lineup — per-player Sportmonks formation_field.

Revision ID: 0017
Revises: 0016
Create Date: 2026-05-13

Adds a nullable VARCHAR column to ``core.lineup`` to record the exact
``formation_field`` Sportmonks attaches to each starter — a "row:col"
string (e.g. "2:3") that locates the player on a 5x5 tactical grid:
row 1 = goalkeeper, row 5 = striker, columns from left (1) to right
(n). This is the canonical source for the tactical pitch view, replacing
the heuristic that parses the team formation string and guesses slots.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0017"
down_revision: str | Sequence[str] | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "lineup",
        sa.Column("formation_field", sa.String(8), nullable=True),
        schema="core",
    )


def downgrade() -> None:
    op.drop_column("lineup", "formation_field", schema="core")
