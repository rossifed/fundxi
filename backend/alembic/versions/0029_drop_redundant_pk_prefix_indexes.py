"""drop indexes redundant with the leading column of a composite PK.

Revision ID: 0029
Revises: 0028
Create Date: 2026-06-09

A standalone index on the first column of a composite primary key can never be
chosen by the planner over the PK B-tree (which already orders on that column
first) — it is pure write overhead and serves no read, FK-cascade, or sort
path. Five such indexes existed; this drops them. The matching ORM models had
their ``index=True`` removed on the same columns so autogenerate stays in sync.

Dropped (table — redundant index — covering PK):
- valuation.player_price_tick      — player_id   (PK player_id, ts)
- valuation.player_daily_snapshot  — player_id   (PK player_id, date)
- app.holding                      — portfolio_id(PK portfolio_id, player_id)
- core.match_comment_player_mention— match_comment_id (PK match_comment_id, player_id)
- app.league_member                — league_id   (PK league_id, user_id)

The *second*-column indexes (holding.player_id, league_member.user_id,
mention.player_id) are kept — those are genuine reverse-lookup paths.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0029"
down_revision: str | Sequence[str] | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (index_name, schema, table, column) — column kept for the downgrade rebuild.
_REDUNDANT_INDEXES: tuple[tuple[str, str, str, str], ...] = (
    ("ix_valuation_player_price_tick_player_id", "valuation", "player_price_tick", "player_id"),
    ("ix_valuation_player_daily_snapshot_player_id", "valuation", "player_daily_snapshot", "player_id"),
    ("ix_app_holding_portfolio_id", "app", "holding", "portfolio_id"),
    (
        "ix_core_match_comment_player_mention_match_comment_id",
        "core",
        "match_comment_player_mention",
        "match_comment_id",
    ),
    ("ix_app_league_member_league_id", "app", "league_member", "league_id"),
)


def upgrade() -> None:
    for name, schema, table, _column in _REDUNDANT_INDEXES:
        op.drop_index(name, table_name=table, schema=schema)


def downgrade() -> None:
    for name, schema, table, column in _REDUNDANT_INDEXES:
        op.create_index(name, table, [column], schema=schema)
