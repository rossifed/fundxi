"""core.player_tournament_stat — per-player, per-season aggregated stats

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-10

Stores the aggregate tournament stats Sportmonks returns under
`statistics.details` for a given (player, season). One row per
sportmonks_statistic_id (their unique block identifier per
player/team/season). Lean primary columns for the most common scout
metrics + a JSONB blob for everything else (future-proofs without
schema churn when we add new displayed metrics).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0011"
down_revision: str | Sequence[str] | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "player_tournament_stat",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sportmonks_statistic_id", sa.BigInteger(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("season_id", sa.BigInteger(), nullable=False),
        sa.Column("appearances", sa.Integer(), nullable=True),
        sa.Column("minutes_played", sa.Integer(), nullable=True),
        sa.Column("goals", sa.Integer(), nullable=True),
        sa.Column("assists", sa.Integer(), nullable=True),
        sa.Column("yellow_cards", sa.Integer(), nullable=True),
        sa.Column("red_cards", sa.Integer(), nullable=True),
        sa.Column("shots_total", sa.Integer(), nullable=True),
        sa.Column("shots_on_target", sa.Integer(), nullable=True),
        sa.Column("key_passes", sa.Integer(), nullable=True),
        sa.Column("rating_avg", sa.Numeric(precision=4, scale=2), nullable=True),
        sa.Column("raw_stats", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["player_id"], ["core.player.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sportmonks_statistic_id", name="ux_player_tournament_stat_sportmonks"),
        schema="core",
    )
    op.create_index(
        "ix_player_tournament_stat_player_id",
        "player_tournament_stat",
        ["player_id"],
        schema="core",
    )
    op.create_index(
        "ix_player_tournament_stat_player_season",
        "player_tournament_stat",
        ["player_id", "season_id"],
        schema="core",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_player_tournament_stat_player_season",
        table_name="player_tournament_stat",
        schema="core",
    )
    op.drop_index(
        "ix_player_tournament_stat_player_id",
        table_name="player_tournament_stat",
        schema="core",
    )
    op.drop_table("player_tournament_stat", schema="core")
