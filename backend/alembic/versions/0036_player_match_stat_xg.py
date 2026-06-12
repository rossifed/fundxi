"""Add xg (Expected Goals) to core.player_match_stat.

Sportmonks ships per-match Expected Goals (type_id 5304) inside the
lineups.details the live poller already archives in raw_details. The
pricing kernel's Layer-2 term has always had an `xg` input + a calibrated
weight (w_xg_per_0_1_pct), but nothing fed it. This typed column lets the
projector persist xG so snapshot._stats can pass it to the kernel.

Nullable NUMERIC, no default → metadata-only ALTER, no table rewrite.

Revision ID: 0036
Revises: 0035
Create Date: 2026-06-12

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0036"
down_revision: str | Sequence[str] | None = "0035"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "player_match_stat",
        sa.Column("xg", sa.Numeric(precision=6, scale=4), nullable=True),
        schema="core",
    )


def downgrade() -> None:
    op.drop_column("player_match_stat", "xg", schema="core")
