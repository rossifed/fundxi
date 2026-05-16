"""app.league + app.league_member, seed the global league.

Revision ID: 0021
Revises: 0020
Create Date: 2026-05-16

- ``app.league``         — one row per league. A single seeded
  ``kind='global'`` row (the everyone-league); ``kind='private'`` rows
  are user-created with a unique invite code.
- ``app.league_member``  — explicit membership, including for the global
  league (every user is auto-joined). Composite PK (league_id, user_id)
  prevents double-join.

Data backfill: every existing ``app.user`` is inserted into the global
league so the leaderboard is populated immediately after migration.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0021"
down_revision: str | Sequence[str] | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "league",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("invite_code", sa.String(16), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("app.user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("invite_code", name="uq_app_league_invite_code"),
        schema="app",
    )
    op.create_index("ix_app_league_kind", "league", ["kind"], schema="app")

    op.create_table(
        "league_member",
        sa.Column("league_id", sa.Integer(), sa.ForeignKey("app.league.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("app.user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("league_id", "user_id"),
        schema="app",
    )
    op.create_index("ix_app_league_member_league_id", "league_member", ["league_id"], schema="app")
    op.create_index("ix_app_league_member_user_id", "league_member", ["user_id"], schema="app")

    # Seed the single global league.
    op.execute(
        "INSERT INTO app.league (name, kind, invite_code, created_by) "
        "VALUES ('Global', 'global', NULL, NULL)"
    )
    # Backfill: every existing user joins the global league.
    op.execute(
        "INSERT INTO app.league_member (league_id, user_id) "
        "SELECT (SELECT id FROM app.league WHERE kind = 'global' LIMIT 1), u.id "
        "FROM app.\"user\" u"
    )


def downgrade() -> None:
    op.drop_index("ix_app_league_member_user_id", table_name="league_member", schema="app")
    op.drop_index("ix_app_league_member_league_id", table_name="league_member", schema="app")
    op.drop_table("league_member", schema="app")
    op.drop_index("ix_app_league_kind", table_name="league", schema="app")
    op.drop_table("league", schema="app")
