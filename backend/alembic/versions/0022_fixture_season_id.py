"""core.fixture.season_id — scope fixtures to their tournament.

Revision ID: 0022
Revises: 0021
Create Date: 2026-05-19

Adds ``season_id`` (Sportmonks season id, native in every fixture
payload) to ``core.fixture`` so the API can show a single tournament.
WC2022 and WC2026 fixtures coexist in the table; without this column
the fixtures endpoint cannot tell them apart and the GUI mixes both.
Nullable + indexed: backfilled from the raw archive after deploy, then
populated natively by ``project_fixture`` on every ingest.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0022"
down_revision: str | Sequence[str] | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("fixture", sa.Column("season_id", sa.Integer(), nullable=True), schema="core")
    op.create_index("ix_core_fixture_season_id", "fixture", ["season_id"], schema="core")


def downgrade() -> None:
    op.drop_index("ix_core_fixture_season_id", table_name="fixture", schema="core")
    op.drop_column("fixture", "season_id", schema="core")
