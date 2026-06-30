"""Frozen pre-match result probability per fixture (odds-based knockout settlement).

Adds ``core.fixture_prediction`` (one row per fixture): the Sportmonks
FULLTIME_RESULT_PROBABILITY (type 237) home/draw/away win probabilities,
captured before kick-off and frozen at the whistle. The knockout settlement
reads it to scale each side's reward/penalty by how (un)likely its result was
(back the underdog → win big; a flopping favourite drops hard). Additive and
backward-compatible: without a row, settlement falls back to the flat fracs.

Revision ID: 0042
Revises: 0041
Create Date: 2026-06-30

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0042"
down_revision: str | Sequence[str] | None = "0041"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "fixture_prediction",
        sa.Column("fixture_id", sa.Integer(), nullable=False),
        sa.Column("p_home", sa.Numeric(precision=6, scale=5), nullable=False),
        sa.Column("p_draw", sa.Numeric(precision=6, scale=5), nullable=False),
        sa.Column("p_away", sa.Numeric(precision=6, scale=5), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["fixture_id"], ["core.fixture.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("fixture_id"),
        schema="core",
    )


def downgrade() -> None:
    op.drop_table("fixture_prediction", schema="core")
