"""core.standings — group-stage standings tables

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-12

One row per team holding its group-stage standing (position, played /
won / drawn / lost, goals for / against / difference, points).
Refreshed by the ingest's StandingsPoller from Sportmonks
``/standings/seasons/{season_id}``. Consumed by the team page's
group-table widget and the standings endpoint.

A team belongs to exactly one group during the group stage, so the
unique key is ``team_id`` alone; ``group`` is denormalised here for
cheap "give me group F's table" queries.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013"
down_revision: str | Sequence[str] | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "standings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("team_id", sa.String(length=8), nullable=False),
        sa.Column("group", sa.String(length=8), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("played", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("won", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("drawn", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("lost", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("goals_for", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("goals_against", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("goal_difference", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("points", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["team_id"], ["core.team.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("team_id", name="ux_standings_team"),
        schema="core",
    )
    op.create_index("ix_standings_group_position", "standings", ["group", "position"], schema="core")


def downgrade() -> None:
    op.drop_index("ix_standings_group_position", table_name="standings", schema="core")
    op.drop_table("standings", schema="core")
