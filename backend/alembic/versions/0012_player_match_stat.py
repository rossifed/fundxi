"""core.player_match_stat — per-player, per-fixture statistics

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-11

Per-match aggregated player statistics (shots, passes, cards, rating)
captured during the live ingest from Sportmonks
``?include=lineups.statistics``. One row per (player_id, fixture_id);
upserted on the fly as the live poller observes new figures.

Companion to ``core.player_tournament_stat`` which holds the
tournament-level aggregates. This table is the source of truth for
per-match stats shown in PlayerSheet's "Recent matches" panel and
fed into the pricing engine for granular post-FT adjustments.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0012"
down_revision: str | Sequence[str] | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "player_match_stat",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("fixture_id", sa.Integer(), nullable=False),
        sa.Column("minutes_played", sa.Integer(), nullable=True),
        sa.Column("shots_total", sa.Integer(), nullable=True),
        sa.Column("shots_on_target", sa.Integer(), nullable=True),
        sa.Column("goals", sa.Integer(), nullable=True),
        sa.Column("assists", sa.Integer(), nullable=True),
        sa.Column("yellow_cards", sa.Integer(), nullable=True),
        sa.Column("red_cards", sa.Integer(), nullable=True),
        sa.Column("key_passes", sa.Integer(), nullable=True),
        sa.Column("passes_total", sa.Integer(), nullable=True),
        sa.Column("passes_accuracy", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("rating", sa.Numeric(precision=4, scale=2), nullable=True),
        sa.Column("raw_details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["player_id"], ["core.player.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fixture_id"], ["core.fixture.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("player_id", "fixture_id", name="ux_player_match_stat_player_fixture"),
        schema="core",
    )
    op.create_index("ix_player_match_stat_fixture_id", "player_match_stat", ["fixture_id"], schema="core")
    op.create_index("ix_player_match_stat_player_id", "player_match_stat", ["player_id"], schema="core")


def downgrade() -> None:
    op.drop_index("ix_player_match_stat_player_id", table_name="player_match_stat", schema="core")
    op.drop_index("ix_player_match_stat_fixture_id", table_name="player_match_stat", schema="core")
    op.drop_table("player_match_stat", schema="core")
