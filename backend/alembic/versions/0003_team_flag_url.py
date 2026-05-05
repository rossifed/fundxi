"""bump core.team.flag to VARCHAR(255) (Sportmonks returns URLs not emoji)

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-05

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "team",
        "flag",
        existing_type=sa.String(length=16),
        type_=sa.String(length=255),
        existing_nullable=False,
        schema="core",
    )


def downgrade() -> None:
    op.alter_column(
        "team",
        "flag",
        existing_type=sa.String(length=255),
        type_=sa.String(length=16),
        existing_nullable=False,
        schema="core",
    )
