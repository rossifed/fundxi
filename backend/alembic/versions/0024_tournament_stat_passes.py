"""core.player_tournament_stat — add passes_total + passes_accuracy.

Revision ID: 0024
Revises: 0023
Create Date: 2026-05-21

Mirrors the two passing columns already present on
``core.player_match_stat`` (per-match) onto the season-aggregate table
so the screener and the player sheet can show total passes and pass
accuracy.

The data is already archived in ``raw_stats`` (Sportmonks stat
``type_id`` 80 = total passes, 1584 = accurate-passes percentage), so
the migration backfills existing rows directly from the JSONB — no
provider re-ingestion needed. New ingests populate the columns via the
updated ``project_player_stat`` projector.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0024"
down_revision: str | Sequence[str] | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "player_tournament_stat",
        sa.Column("passes_total", sa.Integer(), nullable=True),
        schema="core",
    )
    op.add_column(
        "player_tournament_stat",
        sa.Column("passes_accuracy", sa.Numeric(precision=5, scale=2), nullable=True),
        schema="core",
    )
    # Backfill from the already-archived raw Sportmonks payload.
    op.execute(
        """
        UPDATE core.player_tournament_stat s SET
          passes_total = (
            SELECT (d->'value'->>'total')::numeric::int
            FROM jsonb_array_elements(s.raw_stats->'details') d
            WHERE d->>'type_id' = '80'
            LIMIT 1
          ),
          passes_accuracy = (
            SELECT (d->'value'->>'total')::numeric
            FROM jsonb_array_elements(s.raw_stats->'details') d
            WHERE d->>'type_id' = '1584'
            LIMIT 1
          )
        WHERE s.raw_stats IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("player_tournament_stat", "passes_accuracy", schema="core")
    op.drop_column("player_tournament_stat", "passes_total", schema="core")
