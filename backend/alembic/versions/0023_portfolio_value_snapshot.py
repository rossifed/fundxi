"""valuation.portfolio_value_snapshot — bucketed portfolio value history.

Revision ID: 0023
Revises: 0022
Create Date: 2026-05-20

Stores one row per (portfolio, minute-bucket) carrying the user's
portfolio value at the close of that minute. The bucket is enforced
upstream (``ts = date_trunc('minute', tick_ts)``) and the application
uses ``INSERT ... ON CONFLICT (portfolio_id, ts) DO UPDATE`` so a
burst of N ticks in the same minute collapses to a single row
(last-write-wins inside the bucket).

Designed for read-heavy access pattern: the chart fetches a range
on (portfolio_id, ts) which is the primary key + the hypertable
partitioning key. Write rate scales with active-user × dirty-minute,
not with tick rate — see CLAUDE.md / portfolio-history design memo.

Columns:
  - ``cash``           — portfolio cash at bucket close.
  - ``holdings_value`` — Σ shares × price across positions.
  - ``value``          — cash + holdings_value (denormalised so chart
                          queries don't recompute on every read).
  - ``pnl_vs_open``    — value − initial portfolio value, signed €M.
                          Open value is recorded on the first
                          snapshot when the portfolio is bootstrapped.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0023"
down_revision: str | Sequence[str] | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "portfolio_value_snapshot",
        sa.Column("portfolio_id", sa.BigInteger(), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cash", sa.Numeric(14, 2), nullable=False),
        sa.Column("holdings_value", sa.Numeric(14, 2), nullable=False),
        sa.Column("value", sa.Numeric(14, 2), nullable=False),
        sa.Column("pnl_vs_open", sa.Numeric(14, 2), nullable=False),
        sa.ForeignKeyConstraint(["portfolio_id"], ["app.portfolio.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("portfolio_id", "ts"),
        schema="valuation",
    )
    op.create_index(
        "ix_valuation_pvs_portfolio_ts_desc",
        "portfolio_value_snapshot",
        ["portfolio_id", sa.text("ts DESC")],
        schema="valuation",
    )
    # Hypertable on ts. PK already covers (portfolio_id, ts), so
    # creating chunks on ts keeps the primary lookup (portfolio_id, ts
    # range) cheap and bounds chunk size as the data grows.
    op.execute(
        "SELECT create_hypertable('valuation.portfolio_value_snapshot', 'ts', "
        "chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE, migrate_data => TRUE)"
    )


def downgrade() -> None:
    op.drop_index(
        "ix_valuation_pvs_portfolio_ts_desc",
        table_name="portfolio_value_snapshot",
        schema="valuation",
    )
    op.drop_table("portfolio_value_snapshot", schema="valuation")
