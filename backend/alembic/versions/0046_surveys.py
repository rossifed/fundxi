"""Product-research surveys: pushed questions with per-user stored answers.

Lets an admin push a question to users without a deploy (INSERT into
``app.survey_question``). Each signed-in user sees an active question once:
answering (or skipping) writes an ``app.survey_answer`` row — a skip stores
NULL payload columns — and the read endpoint stops returning the question for
that account, across devices. First question planned: "Would you invest real
money in a football player?" (kind ``yes_no_amount``: yes/no + amount in EUR).

Revision ID: 0046
Revises: 0045
Create Date: 2026-07-16

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0046"
down_revision: str | Sequence[str] | None = "0045"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "survey_question",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
        schema="app",
    )
    op.create_table(
        "survey_answer",
        sa.Column("question_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("answer_bool", sa.Boolean(), nullable=True),
        sa.Column("answer_amount", sa.Numeric(18, 6), nullable=True),
        sa.Column("answer_text", sa.Text(), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["app.survey_question.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["app.user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("question_id", "user_id"),
        schema="app",
    )


def downgrade() -> None:
    op.drop_table("survey_answer", schema="app")
    op.drop_table("survey_question", schema="app")
