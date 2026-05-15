"""core.team_match_stat — per-team, per-fixture aggregate statistics

Revision ID: 0019
Revises: 0018
Create Date: 2026-05-14

Wide-flexible table: one row per (fixture, team, type_code). Lets us
add new Sportmonks stat types without a migration. Populated by the
live ingest (InplayPoller) for live matches and by
bootstrap_fixture_details for finished ones.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0019"
down_revision: str | Sequence[str] | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "team_match_stat",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("fixture_id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.String(8), nullable=False),
        sa.Column("type_code", sa.String(64), nullable=False),
        sa.Column("value", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["fixture_id"], ["core.fixture.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["core.team.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("fixture_id", "team_id", "type_code", name="ux_team_match_stat_fixture_team_type"),
        schema="core",
    )
    op.create_index("ix_team_match_stat_fixture_id", "team_match_stat", ["fixture_id"], schema="core")


def downgrade() -> None:
    op.drop_index("ix_team_match_stat_fixture_id", table_name="team_match_stat", schema="core")
    op.drop_table("team_match_stat", schema="core")
