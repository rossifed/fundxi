"""core.player base_value anchor + raw.transfermarkt_market_value seed archive.

Revision ID: 0031
Revises: 0030
Create Date: 2026-06-10

Adds the pricing anchor to the player instrument and the raw archive that seeds it.

- ``core.player.base_value`` (Numeric(8,3), €M, NULL) — the player's pre-tournament
  starting price (t0). The valuation at time t is this anchor times the cumulative
  multiplier of every price change since. Set once from a real market-value
  snapshot; NULL means no anchor → the UI shows "—" rather than a synthesised
  number (the synthetic seed survives only in the sim/replay path).
- ``core.player.base_value_source`` (String(16), NULL) — provenance of the anchor
  ('transfermarkt' | 'derived'); must never be 'synthetic' in prod.
- ``raw.transfermarkt_market_value`` — auditable, re-runnable scrape archive (one
  row per Transfermarkt player). The matching step reads it to write the anchor;
  the live site is never hit at read time.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0031"
down_revision: str | Sequence[str] | None = "0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "player",
        sa.Column("base_value", sa.Numeric(8, 3), nullable=True),
        schema="core",
    )
    op.add_column(
        "player",
        sa.Column("base_value_source", sa.String(16), nullable=True),
        schema="core",
    )
    op.create_table(
        "transfermarkt_market_value",
        sa.Column("tm_player_id", sa.BigInteger(), autoincrement=False, nullable=False),
        sa.Column("player_slug", sa.String(255), nullable=True),
        sa.Column("player_name", sa.String(255), nullable=True),
        sa.Column("team_slug", sa.String(128), nullable=True),
        sa.Column("team_name", sa.String(128), nullable=True),
        sa.Column("team_verein_id", sa.Integer(), nullable=True),
        sa.Column("market_value_m", sa.Numeric(8, 3), nullable=False),
        sa.Column("currency", sa.String(3), server_default="EUR", nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("tm_player_id"),
        schema="raw",
    )


def downgrade() -> None:
    op.drop_table("transfermarkt_market_value", schema="raw")
    op.drop_column("player", "base_value_source", schema="core")
    op.drop_column("player", "base_value", schema="core")
