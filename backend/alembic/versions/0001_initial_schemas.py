"""initial schemas (raw, core, valuation) + timescaledb extension

Revision ID: 0001
Revises:
Create Date: 2026-05-05

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # TimescaleDB is OPTIONAL. fundXI uses hypertables purely for partitioning
    # two valuation tables and relies on NO Timescale-only feature (no
    # time_bucket, continuous aggregates or compression), so the schema runs
    # identically on plain Postgres (e.g. Railway's managed PG). Only create
    # the extension when the server actually offers it; otherwise skip and the
    # hypertable migrations fall back to plain tables.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
                CREATE EXTENSION IF NOT EXISTS timescaledb;
            END IF;
        END
        $$;
        """
    )
    op.execute("CREATE SCHEMA IF NOT EXISTS raw")
    op.execute("CREATE SCHEMA IF NOT EXISTS core")
    op.execute("CREATE SCHEMA IF NOT EXISTS valuation")


def downgrade() -> None:
    op.execute("DROP SCHEMA IF EXISTS valuation CASCADE")
    op.execute("DROP SCHEMA IF EXISTS core CASCADE")
    op.execute("DROP SCHEMA IF EXISTS raw CASCADE")
    # Note: timescaledb extension is left in place — dropping it can be destructive.
