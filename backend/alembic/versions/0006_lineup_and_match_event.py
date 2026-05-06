"""core.lineup and core.match_event tables

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-06

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "lineup",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sportmonks_id", sa.Integer(), nullable=False),
        sa.Column("fixture_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.String(length=8), nullable=False),
        sa.Column("role", sa.String(length=8), nullable=False),
        sa.Column("position", sa.String(length=4), nullable=False),
        sa.Column("jersey_number", sa.Integer(), nullable=True),
        sa.Column("formation_position", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["fixture_id"], ["core.fixture.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_id"], ["core.player.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["core.team.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        schema="core",
    )
    op.create_index("ix_core_lineup_sportmonks_id", "lineup", ["sportmonks_id"], unique=True, schema="core")
    op.create_index("ix_core_lineup_fixture_id", "lineup", ["fixture_id"], schema="core")
    op.create_index("ix_core_lineup_player_id", "lineup", ["player_id"], schema="core")
    op.create_index("ix_core_lineup_team_id", "lineup", ["team_id"], schema="core")

    op.create_table(
        "match_event",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sportmonks_id", sa.Integer(), nullable=False),
        sa.Column("fixture_id", sa.Integer(), nullable=False),
        sa.Column("minute", sa.Integer(), nullable=False),
        sa.Column("extra_minute", sa.Integer(), nullable=True),
        sa.Column("type", sa.String(length=24), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=True),
        sa.Column("related_player_id", sa.Integer(), nullable=True),
        sa.Column("team_id", sa.String(length=8), nullable=True),
        sa.Column("info", sa.String(length=255), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["fixture_id"], ["core.fixture.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_id"], ["core.player.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["related_player_id"], ["core.player.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["team_id"], ["core.team.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        schema="core",
    )
    op.create_index("ix_core_match_event_sportmonks_id", "match_event", ["sportmonks_id"], unique=True, schema="core")
    op.create_index("ix_core_match_event_fixture_id", "match_event", ["fixture_id"], schema="core")
    op.create_index("ix_core_match_event_type", "match_event", ["type"], schema="core")
    op.create_index(
        "ix_core_match_event_fixture_sequence", "match_event", ["fixture_id", "sequence"], schema="core"
    )
    op.create_index("ix_core_match_event_player_id", "match_event", ["player_id"], schema="core")


def downgrade() -> None:
    op.drop_index("ix_core_match_event_player_id", table_name="match_event", schema="core")
    op.drop_index("ix_core_match_event_fixture_sequence", table_name="match_event", schema="core")
    op.drop_index("ix_core_match_event_type", table_name="match_event", schema="core")
    op.drop_index("ix_core_match_event_fixture_id", table_name="match_event", schema="core")
    op.drop_index("ix_core_match_event_sportmonks_id", table_name="match_event", schema="core")
    op.drop_table("match_event", schema="core")

    op.drop_index("ix_core_lineup_team_id", table_name="lineup", schema="core")
    op.drop_index("ix_core_lineup_player_id", table_name="lineup", schema="core")
    op.drop_index("ix_core_lineup_fixture_id", table_name="lineup", schema="core")
    op.drop_index("ix_core_lineup_sportmonks_id", table_name="lineup", schema="core")
    op.drop_table("lineup", schema="core")
