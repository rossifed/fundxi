"""Add enriched stat columns to core.player_tournament_stat.

The PlayerSheet Statistics panel surfaced only 13 metrics while the
Sportmonks player.statistics block carries ~40 (already archived in
raw_stats). This adds typed nullable columns for the high-value football
metrics across defence, creation/possession, dribble and goalkeeping so
the projector can persist them and the BFF can serve them. All columns are
nullable INTEGER with no default → metadata-only ALTER, no table rewrite.

Revision ID: 0035
Revises: 0034
Create Date: 2026-06-12

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0035"
down_revision: str | Sequence[str] | None = "0034"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "player_tournament_stat"
_SCHEMA = "core"

_COLUMNS = (
    "shots_off_target",
    "offsides",
    "big_chances_created",
    "accurate_passes",
    "crosses_total",
    "crosses_accurate",
    "long_balls",
    "through_balls",
    "dribble_attempts",
    "dribbles_completed",
    "dispossessed",
    "dribbled_past",
    "fouls_drawn",
    "tackles",
    "interceptions",
    "clearances",
    "total_duels",
    "duels_won",
    "aerials_won",
    "shots_blocked",
    "fouls",
    "saves",
    "goals_conceded",
)


def upgrade() -> None:
    for column in _COLUMNS:
        op.add_column(_TABLE, sa.Column(column, sa.Integer(), nullable=True), schema=_SCHEMA)


def downgrade() -> None:
    for column in reversed(_COLUMNS):
        op.drop_column(_TABLE, column, schema=_SCHEMA)
