"""core static tables (team, player, fixture) + raw.sportmonks_event

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-05

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "team",
        sa.Column("id", sa.String(length=8), nullable=False),
        sa.Column("sportmonks_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("flag", sa.String(length=16), nullable=False),
        sa.Column("color", sa.String(length=16), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("confederation", sa.String(length=16), nullable=True),
        sa.Column("group", sa.String(length=8), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="core",
    )
    op.create_index("ix_core_team_sportmonks_id", "team", ["sportmonks_id"], unique=True, schema="core")

    op.create_table(
        "fixture",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sportmonks_id", sa.Integer(), nullable=True),
        sa.Column("home_team_id", sa.String(length=8), nullable=False),
        sa.Column("away_team_id", sa.String(length=8), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("group", sa.String(length=8), nullable=False),
        sa.Column("home_score", sa.Integer(), nullable=True),
        sa.Column("away_score", sa.Integer(), nullable=True),
        sa.Column("kickoff_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("minute", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["away_team_id"], ["core.team.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["home_team_id"], ["core.team.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        schema="core",
    )
    op.create_index("ix_core_fixture_away_team_id", "fixture", ["away_team_id"], unique=False, schema="core")
    op.create_index("ix_core_fixture_group", "fixture", ["group"], unique=False, schema="core")
    op.create_index("ix_core_fixture_home_team_id", "fixture", ["home_team_id"], unique=False, schema="core")
    op.create_index("ix_core_fixture_kickoff_at", "fixture", ["kickoff_at"], unique=False, schema="core")
    op.create_index("ix_core_fixture_sportmonks_id", "fixture", ["sportmonks_id"], unique=True, schema="core")
    op.create_index("ix_core_fixture_status", "fixture", ["status"], unique=False, schema="core")

    op.create_table(
        "player",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sportmonks_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("jersey_number", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.String(length=8), nullable=False),
        sa.Column("position", sa.String(length=4), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("foot", sa.String(length=8), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("weight", sa.Integer(), nullable=True),
        sa.Column("club", sa.String(length=128), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["core.team.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        schema="core",
    )
    op.create_index("ix_core_player_sportmonks_id", "player", ["sportmonks_id"], unique=True, schema="core")
    op.create_index("ix_core_player_team_id", "player", ["team_id"], unique=False, schema="core")

    op.create_table(
        "sportmonks_event",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("endpoint", sa.String(length=255), nullable=False),
        sa.Column("params", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("response", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("response_hash", sa.String(length=64), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint", "response_hash", name="uq_raw_sportmonks_event_endpoint_hash"),
        schema="raw",
    )
    op.create_index("ix_raw_sportmonks_event_endpoint", "sportmonks_event", ["endpoint"], unique=False, schema="raw")
    op.create_index(
        "ix_raw_sportmonks_event_ingested_at",
        "sportmonks_event",
        ["ingested_at"],
        unique=False,
        schema="raw",
    )


def downgrade() -> None:
    op.drop_index("ix_raw_sportmonks_event_ingested_at", table_name="sportmonks_event", schema="raw")
    op.drop_index("ix_raw_sportmonks_event_endpoint", table_name="sportmonks_event", schema="raw")
    op.drop_table("sportmonks_event", schema="raw")

    op.drop_index("ix_core_player_team_id", table_name="player", schema="core")
    op.drop_index("ix_core_player_sportmonks_id", table_name="player", schema="core")
    op.drop_table("player", schema="core")

    op.drop_index("ix_core_fixture_status", table_name="fixture", schema="core")
    op.drop_index("ix_core_fixture_sportmonks_id", table_name="fixture", schema="core")
    op.drop_index("ix_core_fixture_kickoff_at", table_name="fixture", schema="core")
    op.drop_index("ix_core_fixture_home_team_id", table_name="fixture", schema="core")
    op.drop_index("ix_core_fixture_group", table_name="fixture", schema="core")
    op.drop_index("ix_core_fixture_away_team_id", table_name="fixture", schema="core")
    op.drop_table("fixture", schema="core")

    op.drop_index("ix_core_team_sportmonks_id", table_name="team", schema="core")
    op.drop_table("team", schema="core")
