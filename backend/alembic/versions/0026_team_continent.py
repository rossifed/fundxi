"""Rename core.team.confederation -> core.team.continent.

Revision ID: 0026
Revises: 0025
Create Date: 2026-05-22

Sportmonks does not expose a football confederation for a national team,
only the country's continent. We store the provider-truthful value
(continent) rather than an invented confederation. The column is empty
(0/54 rows) so the rename is a pure metadata change.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0026"
down_revision: str | Sequence[str] | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("team", "confederation", new_column_name="continent", schema="core")


def downgrade() -> None:
    op.alter_column("team", "continent", new_column_name="confederation", schema="core")
