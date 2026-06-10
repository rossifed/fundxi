"""drop the dead valuation.player_price_tick.change_since_open column.

Revision ID: 0032
Revises: 0031
Create Date: 2026-06-10

``change_since_open`` is no longer read by any consumer: every "match %" is now
derived from tick PRICES in the single read-model (and the per-match endpoint),
independent of any stored per-tick delta. The column had become write-only dead
weight with an inconsistent meaning across producers (per-event for replay,
cumulative for live), so the producers stopped writing it and this drops it.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0032"
down_revision: str | Sequence[str] | None = "0031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("player_price_tick", "change_since_open", schema="valuation")


def downgrade() -> None:
    # Re-add as NOT NULL with a 0 default (back-fills existing rows); producers
    # would need to be reverted in tandem to repopulate it meaningfully.
    op.add_column(
        "player_price_tick",
        sa.Column("change_since_open", sa.Numeric(6, 2), nullable=False, server_default="0"),
        schema="valuation",
    )
    op.alter_column("player_price_tick", "change_since_open", server_default=None, schema="valuation")
