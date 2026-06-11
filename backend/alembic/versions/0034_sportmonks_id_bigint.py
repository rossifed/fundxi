"""Widen all core.*.sportmonks_id columns from INTEGER to BIGINT.

Sportmonks issues detail-level ids (lineups, events, comments) in the
billions — e.g. a lineup id of 14674040054 overflows int32 (max
2147483647) and aborts the whole live-tick transaction with a DataError,
so the WC2026 opener never persisted. Provider ids are external opaque
identifiers and must be BIGINT everywhere; the reference tables (team,
player, fixture, ...) are widened too for consistency and future-proofing.

Revision ID: 0034
Revises: 0033
Create Date: 2026-06-11

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0034"
down_revision: str | Sequence[str] | None = "0033"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = (
    "team",
    "player",
    "fixture",
    "lineup",
    "match_event",
    "match_comment",
    "venue",
    "coach",
    "news",
)


def upgrade() -> None:
    # Safety net: never hang api boot on a lock again. The ALTER needs an
    # ACCESS EXCLUSIVE lock on each table; if the ingest worker is still
    # writing to them, fail fast (within 5s) instead of blocking uvicorn
    # forever behind `alembic upgrade head`. Deploy procedure: pause the
    # ingest service (0 replicas) so the lock is free and this completes
    # instantly, then resume ingest.
    op.execute("SET LOCAL lock_timeout = '5s'")
    for table in _TABLES:
        op.alter_column(
            table,
            "sportmonks_id",
            type_=sa.BigInteger(),
            postgresql_using="sportmonks_id::bigint",
            schema="core",
        )


def downgrade() -> None:
    for table in _TABLES:
        op.alter_column(
            table,
            "sportmonks_id",
            type_=sa.Integer(),
            postgresql_using="sportmonks_id::integer",
            schema="core",
        )
