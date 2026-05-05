"""core.news and core.match_comment tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-05

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "news",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sportmonks_id", sa.Integer(), nullable=False),
        sa.Column("fixture_id", sa.Integer(), nullable=True),
        sa.Column("league_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["fixture_id"], ["core.fixture.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        schema="core",
    )
    op.create_index("ix_core_news_sportmonks_id", "news", ["sportmonks_id"], unique=True, schema="core")
    op.create_index("ix_core_news_fixture_id", "news", ["fixture_id"], schema="core")
    op.create_index("ix_core_news_type", "news", ["type"], schema="core")
    op.create_index("ix_core_news_published_at", "news", ["published_at"], schema="core")

    op.create_table(
        "match_comment",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sportmonks_id", sa.Integer(), nullable=False),
        sa.Column("fixture_id", sa.Integer(), nullable=False),
        sa.Column("minute", sa.Integer(), nullable=False),
        sa.Column("extra_minute", sa.Integer(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("is_goal", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_important", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["fixture_id"], ["core.fixture.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="core",
    )
    op.create_index(
        "ix_core_match_comment_sportmonks_id", "match_comment", ["sportmonks_id"], unique=True, schema="core"
    )
    op.create_index("ix_core_match_comment_fixture_id", "match_comment", ["fixture_id"], schema="core")
    op.create_index(
        "ix_core_match_comment_fixture_sequence", "match_comment", ["fixture_id", "sequence"], schema="core"
    )


def downgrade() -> None:
    op.drop_index("ix_core_match_comment_fixture_sequence", table_name="match_comment", schema="core")
    op.drop_index("ix_core_match_comment_fixture_id", table_name="match_comment", schema="core")
    op.drop_index("ix_core_match_comment_sportmonks_id", table_name="match_comment", schema="core")
    op.drop_table("match_comment", schema="core")

    op.drop_index("ix_core_news_published_at", table_name="news", schema="core")
    op.drop_index("ix_core_news_type", table_name="news", schema="core")
    op.drop_index("ix_core_news_fixture_id", table_name="news", schema="core")
    op.drop_index("ix_core_news_sportmonks_id", table_name="news", schema="core")
    op.drop_table("news", schema="core")
