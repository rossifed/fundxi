"""set updated_at = now() via BEFORE UPDATE trigger on every audited table.

Revision ID: 0028
Revises: 0027
Create Date: 2026-06-09

``AuditMixin.updated_at`` relies on SQLAlchemy's ``onupdate=now()``, which only
fires on unit-of-work UPDATEs. Every core entity is written through
``pg_insert(...).on_conflict_do_update(...)`` (idempotent re-ingest), which
bypasses ``onupdate`` entirely — so ``updated_at`` was frozen at first insert
and never moved on re-ingest. The stat tables worked around it by setting
``updated_at`` in the conflict payload by hand; the core tables did not.

This installs a single DB-level guarantee instead: a ``BEFORE UPDATE`` trigger
that stamps ``now()`` on the row regardless of the write path (ORM, UPSERT,
raw SQL). Attached to every table carrying an ``updated_at`` column. The
trigger overrides whatever value the writer supplied, which is exactly the
audit semantics we want ("last modification time").
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0028"
down_revision: str | Sequence[str] | None = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Every (schema, table) carrying an `updated_at` column. Keep in sync when a
# new audited table is added (or move the trigger creation into that table's
# own migration).
_AUDITED_TABLES: tuple[tuple[str, str], ...] = (
    ("core", "team"),
    ("core", "fixture"),
    ("core", "player"),
    ("core", "news"),
    ("core", "match_comment"),
    ("core", "lineup"),
    ("core", "match_event"),
    ("core", "player_tournament_stat"),
    ("core", "player_match_stat"),
    ("core", "standings"),
    ("core", "team_match_stat"),
    ("app", "portfolio"),
    ("valuation", "pricing_progress"),
)


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION core.set_updated_at()
        RETURNS trigger AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    for schema, table in _AUDITED_TABLES:
        op.execute(f'DROP TRIGGER IF EXISTS trg_set_updated_at ON {schema}."{table}"')
        op.execute(
            f'CREATE TRIGGER trg_set_updated_at '
            f'BEFORE UPDATE ON {schema}."{table}" '
            f'FOR EACH ROW EXECUTE FUNCTION core.set_updated_at()'
        )


def downgrade() -> None:
    for schema, table in _AUDITED_TABLES:
        op.execute(f'DROP TRIGGER IF EXISTS trg_set_updated_at ON {schema}."{table}"')
    op.execute("DROP FUNCTION IF EXISTS core.set_updated_at()")
