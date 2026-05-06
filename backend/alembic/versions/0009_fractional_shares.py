"""Switch holding.shares and trade.shares from INTEGER to NUMERIC(12,4).

Robinhood-style fractional shares: with player prices in €M and a starter
portfolio of €100M, integer shares would lock the user out of any player
priced above their cash balance. Sub-share precision keeps the percentage-
of-portfolio trade flow viable.

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-06

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009"
down_revision: str | Sequence[str] | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "holding",
        "shares",
        type_=sa.Numeric(12, 4),
        postgresql_using="shares::numeric(12,4)",
        schema="app",
    )
    op.alter_column(
        "trade",
        "shares",
        type_=sa.Numeric(12, 4),
        postgresql_using="shares::numeric(12,4)",
        schema="app",
    )


def downgrade() -> None:
    op.alter_column(
        "trade",
        "shares",
        type_=sa.Integer(),
        postgresql_using="shares::integer",
        schema="app",
    )
    op.alter_column(
        "holding",
        "shares",
        type_=sa.Integer(),
        postgresql_using="shares::integer",
        schema="app",
    )
