"""Capture Sportmonks fine-grained fixture state: a transition log + current-state cache.

``_project_status`` collapses the rich Sportmonks state (INPLAY_1ST_HALF, HT,
INPLAY_2ND_HALF, BREAK, EXTRA_TIME, PEN_LIVE, FT, AET, FT_PEN, ...) into a coarse
``status`` (upcoming/live/finished), discarding provider data we pay for. This adds:

- ``core.fixture_state_event``: append-only log of every observed state CHANGE,
  with the full Sportmonks ``state`` object (JSONB) + the match minute + the
  wall-clock observation time. Enables simulation replay and phase-timing audit.
- ``core.fixture.state_code`` / ``state_changed_at``: a current-state cache the
  live trading gate reads (lock during play, re-open at HT/FT after a buffer
  counted from ``state_changed_at``) without replaying the log.

Additive + backward-compatible: ``status`` stays, derived as before; the new
columns are nullable and the poller backfills them as fixtures are observed.

Revision ID: 0039
Revises: 0038
Create Date: 2026-06-25

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "0039"
down_revision: str | Sequence[str] | None = "0038"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "fixture_state_event",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("fixture_id", sa.Integer(), nullable=False),
        sa.Column("state_code", sa.String(length=32), nullable=False),
        sa.Column("state", JSONB(), nullable=False),
        sa.Column("minute", sa.Integer(), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["fixture_id"], ["core.fixture.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="core",
    )
    op.create_index(
        "ix_core_fixture_state_event_fixture_observed",
        "fixture_state_event",
        ["fixture_id", "observed_at"],
        schema="core",
    )
    op.add_column("fixture", sa.Column("state_code", sa.String(length=32), nullable=True), schema="core")
    op.add_column(
        "fixture",
        sa.Column("state_changed_at", sa.DateTime(timezone=True), nullable=True),
        schema="core",
    )


def downgrade() -> None:
    op.drop_column("fixture", "state_changed_at", schema="core")
    op.drop_column("fixture", "state_code", schema="core")
    op.drop_index(
        "ix_core_fixture_state_event_fixture_observed",
        table_name="fixture_state_event",
        schema="core",
    )
    op.drop_table("fixture_state_event", schema="core")
