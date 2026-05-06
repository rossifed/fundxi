"""app.user, app.portfolio, app.holding, app.trade

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-06

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008"
down_revision: str | Sequence[str] | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS app")

    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("strategy", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_app_user_name"),
        schema="app",
    )
    op.create_index("ix_app_user_kind", "user", ["kind"], schema="app")

    op.create_table(
        "portfolio",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("cash", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["app.user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_app_portfolio_user_id"),
        schema="app",
    )
    op.create_index("ix_app_portfolio_user_id", "portfolio", ["user_id"], schema="app")

    op.create_table(
        "holding",
        sa.Column("portfolio_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("shares", sa.Integer(), nullable=False),
        sa.Column("average_buy_price", sa.Numeric(10, 2), nullable=False),
        sa.ForeignKeyConstraint(["portfolio_id"], ["app.portfolio.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_id"], ["core.player.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("portfolio_id", "player_id"),
        schema="app",
    )
    op.create_index("ix_app_holding_portfolio_id", "holding", ["portfolio_id"], schema="app")
    op.create_index("ix_app_holding_player_id", "holding", ["player_id"], schema="app")

    op.create_table(
        "trade",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("portfolio_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=8), nullable=False),
        sa.Column("shares", sa.Integer(), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["portfolio_id"], ["app.portfolio.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_id"], ["core.player.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="app",
    )
    op.create_index("ix_app_trade_portfolio_id", "trade", ["portfolio_id"], schema="app")
    op.create_index("ix_app_trade_player_id", "trade", ["player_id"], schema="app")
    op.create_index("ix_app_trade_executed_at", "trade", ["executed_at"], schema="app")


def downgrade() -> None:
    op.drop_index("ix_app_trade_executed_at", table_name="trade", schema="app")
    op.drop_index("ix_app_trade_player_id", table_name="trade", schema="app")
    op.drop_index("ix_app_trade_portfolio_id", table_name="trade", schema="app")
    op.drop_table("trade", schema="app")

    op.drop_index("ix_app_holding_player_id", table_name="holding", schema="app")
    op.drop_index("ix_app_holding_portfolio_id", table_name="holding", schema="app")
    op.drop_table("holding", schema="app")

    op.drop_index("ix_app_portfolio_user_id", table_name="portfolio", schema="app")
    op.drop_table("portfolio", schema="app")

    op.drop_index("ix_app_user_kind", table_name="user", schema="app")
    op.drop_table("user", schema="app")

    op.execute("DROP SCHEMA IF EXISTS app CASCADE")
