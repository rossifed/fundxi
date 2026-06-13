"""Add four more player_tournament_stat columns.

Surfaces high-value player metrics the Sportmonks player.statistics block
already carries (archived in raw_stats) but that the panel dropped:
big chances missed (581), own goals (324), errors leading to a goal (571)
and clean sheets (194). All nullable INTEGER, no default → metadata-only
ALTER, no table rewrite.

Revision ID: 0037
Revises: 0036
Create Date: 2026-06-13

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0037"
down_revision: str | Sequence[str] | None = "0036"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "player_tournament_stat"
_SCHEMA = "core"

_COLUMNS = (
    "big_chances_missed",
    "own_goals",
    "errors_leading_to_goal",
    "clean_sheets",
)


def upgrade() -> None:
    for column in _COLUMNS:
        op.add_column(_TABLE, sa.Column(column, sa.Integer(), nullable=True), schema=_SCHEMA)


def downgrade() -> None:
    for column in reversed(_COLUMNS):
        op.drop_column(_TABLE, column, schema=_SCHEMA)
