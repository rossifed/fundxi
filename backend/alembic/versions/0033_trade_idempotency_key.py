"""app.trade idempotency key — dedupe duplicate trade submissions.

Revision ID: 0033
Revises: 0032
Create Date: 2026-06-11

Makes ``POST /api/trades`` idempotent. A client may send an ``Idempotency-Key``
header (UUID); a retry carrying the same key replays the recorded trade instead
of executing a second one.

- ``app.trade.idempotency_key`` (String(64), NULL) — the client token. NULL for
  the legacy path (clients that don't send the header) — those keep appending
  freely.
- UNIQUE (portfolio_id, idempotency_key) — at most one trade per (portfolio,
  key). Postgres treats NULLs as distinct, so NULL keys are exempt from the
  constraint and the no-key path is unaffected.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0033"
down_revision: str | Sequence[str] | None = "0032"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "trade",
        sa.Column("idempotency_key", sa.String(64), nullable=True),
        schema="app",
    )
    op.create_unique_constraint(
        "uq_trade_portfolio_idempotency_key",
        "trade",
        ["portfolio_id", "idempotency_key"],
        schema="app",
    )


def downgrade() -> None:
    op.drop_constraint("uq_trade_portfolio_idempotency_key", "trade", schema="app", type_="unique")
    op.drop_column("trade", "idempotency_key", schema="app")
