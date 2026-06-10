"""add indexes that serve the Screener anchor + last-match lookups.

Revision ID: 0030
Revises: 0029
Create Date: 2026-06-10

The Screener read model (``application/screener_view.py``) runs two patterns per
request that the existing PK ``(player_id, ts)`` and the ``ts`` index cannot
serve:

1. The pre-tournament *anchor*:
       SELECT DISTINCT ON (player_id) ...
       ORDER BY player_id, (fixture_id IS NOT NULL) ASC, ts ASC
   The sort key is an EXPRESSION, so the planner cannot use any plain index and
   falls back to a full sort of the whole tick table on every load.

2. The *most recent fixture* per player (inside the last-match LATERAL):
       WHERE player_id = ? AND fixture_id IS NOT NULL ORDER BY ts DESC LIMIT 1

This adds two targeted indexes that turn both into index scans:

- an expression index matching the anchor's exact sort order, so DISTINCT ON
  walks the index and takes the first row per player;
- a partial index over fixtured ticks for the recent-fixture lookup.

These are read-path indexes (the opposite tradeoff from 0029, which dropped
write-only ones): both serve a hot query the planner otherwise can't optimise.
``player_price_tick`` is a TimescaleDB hypertable; CREATE INDEX propagates to
every chunk.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0030"
down_revision: str | Sequence[str] | None = "0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ANCHOR_INDEX = "ix_valuation_player_price_tick_anchor"
_FIXTURE_TS_INDEX = "ix_valuation_player_price_tick_fixture_ts"


def upgrade() -> None:
    # Matches: ORDER BY player_id, (fixture_id IS NOT NULL) ASC, ts ASC
    op.execute(
        f"CREATE INDEX IF NOT EXISTS {_ANCHOR_INDEX} "
        f"ON valuation.player_price_tick (player_id, (fixture_id IS NOT NULL), ts)"
    )
    # Matches: WHERE player_id = ? AND fixture_id IS NOT NULL ORDER BY ts DESC
    op.execute(
        f"CREATE INDEX IF NOT EXISTS {_FIXTURE_TS_INDEX} "
        f"ON valuation.player_price_tick (player_id, ts DESC) "
        f"WHERE fixture_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS valuation.{_FIXTURE_TS_INDEX}")
    op.execute(f"DROP INDEX IF EXISTS valuation.{_ANCHOR_INDEX}")
