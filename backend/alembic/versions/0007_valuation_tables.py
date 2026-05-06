"""valuation.player_price_tick (hypertable) + valuation.player_daily_snapshot

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-06

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "player_price_tick",
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fixture_id", sa.Integer(), nullable=True),
        sa.Column("current_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("performance_rating", sa.Numeric(4, 2), nullable=False),
        sa.Column("change_since_open", sa.Numeric(6, 2), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.ForeignKeyConstraint(["player_id"], ["core.player.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fixture_id"], ["core.fixture.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("player_id", "ts"),
        schema="valuation",
    )
    op.create_index(
        "ix_valuation_player_price_tick_player_id", "player_price_tick", ["player_id"], schema="valuation"
    )
    op.create_index("ix_valuation_player_price_tick_ts", "player_price_tick", ["ts"], schema="valuation")
    # Activate the TimescaleDB hypertable on `ts`. The PK already covers
    # (player_id, ts) so the hypertable migration just adds time-based chunks.
    op.execute(
        "SELECT create_hypertable('valuation.player_price_tick', 'ts', "
        "if_not_exists => TRUE, migrate_data => TRUE)"
    )

    op.create_table(
        "player_daily_snapshot",
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("open_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("close_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("change_24h", sa.Numeric(6, 2), nullable=False),
        sa.ForeignKeyConstraint(["player_id"], ["core.player.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("player_id", "date"),
        schema="valuation",
    )
    op.create_index(
        "ix_valuation_player_daily_snapshot_player_id",
        "player_daily_snapshot",
        ["player_id"],
        schema="valuation",
    )
    op.create_index(
        "ix_valuation_player_daily_snapshot_date",
        "player_daily_snapshot",
        ["date"],
        schema="valuation",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_valuation_player_daily_snapshot_date", table_name="player_daily_snapshot", schema="valuation"
    )
    op.drop_index(
        "ix_valuation_player_daily_snapshot_player_id",
        table_name="player_daily_snapshot",
        schema="valuation",
    )
    op.drop_table("player_daily_snapshot", schema="valuation")

    # Hypertable removal is implicit when the underlying table is dropped.
    op.drop_index("ix_valuation_player_price_tick_ts", table_name="player_price_tick", schema="valuation")
    op.drop_index(
        "ix_valuation_player_price_tick_player_id", table_name="player_price_tick", schema="valuation"
    )
    op.drop_table("player_price_tick", schema="valuation")
