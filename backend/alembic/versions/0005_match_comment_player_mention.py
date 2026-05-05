"""core.match_comment_player_mention association table

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-05

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "match_comment_player_mention",
        sa.Column("match_comment_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["match_comment_id"], ["core.match_comment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_id"], ["core.player.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("match_comment_id", "player_id"),
        schema="core",
    )
    op.create_index(
        "ix_core_match_comment_player_mention_match_comment_id",
        "match_comment_player_mention",
        ["match_comment_id"],
        schema="core",
    )
    op.create_index(
        "ix_core_match_comment_player_mention_player_id",
        "match_comment_player_mention",
        ["player_id"],
        schema="core",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_core_match_comment_player_mention_player_id",
        table_name="match_comment_player_mention",
        schema="core",
    )
    op.drop_index(
        "ix_core_match_comment_player_mention_match_comment_id",
        table_name="match_comment_player_mention",
        schema="core",
    )
    op.drop_table("match_comment_player_mention", schema="core")
