"""Widen money columns to NUMERIC(18,6) — kill the account-level rounding residual.

`shares` is NUMERIC(12,4) and prices are NUMERIC(_,2), so `shares * price` lands
on up to 6 decimals. The cash/total columns stored only 2 decimals, so the trade
charge (`round(shares*price, 2)`) drifted from the position's mark: a fresh buy at
the current price left a sub-cent residual at the account level, surfaced as a
phantom return once divided into a percentage (a new user showed -0.05%, and a
short on an un-ticked player inflated to +20%).

This widens the money columns to scale 6 so `total = shares * price` is stored
exactly and cash reconciles with the mark to the cent. Paired with removing the
domain-level `round(..., 2)` in trade_execution (money is rounded only at display).

WIDENING ONLY — purely value-preserving: existing `x.xx` become `x.xx0000`, no
data is rewritten or lost, and it is backward-compatible (old code writing 2 dp
still fits). Forward-only: balances already banked at 2 dp keep their existing
residual; only new trades are exact. Tiny tables (single-digit portfolios), so the
ALTER is instantaneous.

Revision ID: 0038
Revises: 0037
Create Date: 2026-06-17

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0038"
down_revision: str | Sequence[str] | None = "0037"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (schema, table, column, old_type) — widened to NUMERIC(18, 6).
_COLUMNS = (
    ("app", "portfolio", "cash", sa.Numeric(12, 2)),
    ("app", "trade", "total", sa.Numeric(12, 2)),
    ("valuation", "portfolio_value_snapshot", "cash", sa.Numeric(14, 2)),
    ("valuation", "portfolio_value_snapshot", "holdings_value", sa.Numeric(14, 2)),
    ("valuation", "portfolio_value_snapshot", "value", sa.Numeric(14, 2)),
    ("valuation", "portfolio_value_snapshot", "pnl_vs_open", sa.Numeric(14, 2)),
)

_WIDE = sa.Numeric(18, 6)


def upgrade() -> None:
    # Fail fast instead of hanging api boot behind `alembic upgrade head`: the
    # snapshot service writes portfolio_value_snapshot after every tick batch, so
    # the ACCESS EXCLUSIVE lock could contend during active pricing. 5s timeout →
    # if busy, the migration aborts cleanly and retries when quiet (same safety
    # net as 0034). The tables are tiny, so when free the ALTER is instantaneous.
    op.execute("SET LOCAL lock_timeout = '5s'")
    for schema, table, column, _ in _COLUMNS:
        op.alter_column(table, column, type_=_WIDE, schema=schema)


def downgrade() -> None:
    # Re-narrowing rounds back to the old scale (the residual reappears for any
    # value that had gained sub-cent precision); harmless and reversible.
    for schema, table, column, old in _COLUMNS:
        op.alter_column(table, column, type_=old, schema=schema)
