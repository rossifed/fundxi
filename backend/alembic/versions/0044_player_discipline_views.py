"""Event-derived discipline views — the single source for card counts.

``core.player_fixture_discipline`` (fixture grain) and
``core.player_season_discipline`` (season rollup) derive yellow/red card
counts from ``core.match_event``, the live-reconciled timeline. The ONE
definition of the card semantics lives here:

  yellow = ``yellow_card`` events
  red    = ``red_card`` + ``yellow_red_card`` events
           (a second-yellow sending-off counts as a red, and its second
           yellow is NOT double-counted as a yellow — Sportmonks encodes
           it as the single ``yellowredcard`` event)

Every card count displayed anywhere (tournament stats strip, per-match
stats panel, screener, player match rows) reads these views, so the counts
are live during a match and always equal the displayed timeline. The card
columns projected from Sportmonks aggregate statistics remain stored (raw
projection) but leave the read path.

Revision ID: 0044
Revises: 0043
Create Date: 2026-07-13

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0044"
down_revision: str | Sequence[str] | None = "0043"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE VIEW core.player_fixture_discipline AS
        SELECT
          e.fixture_id,
          e.player_id,
          f.season_id,
          COUNT(*) FILTER (WHERE e.type = 'yellow_card')::int AS yellow_cards,
          COUNT(*) FILTER (WHERE e.type IN ('red_card', 'yellow_red_card'))::int AS red_cards
        FROM core.match_event e
        JOIN core.fixture f ON f.id = e.fixture_id
        WHERE e.player_id IS NOT NULL
          AND e.type IN ('yellow_card', 'red_card', 'yellow_red_card')
        GROUP BY e.fixture_id, e.player_id, f.season_id
        """
    )
    op.execute(
        """
        CREATE VIEW core.player_season_discipline AS
        SELECT
          player_id,
          season_id,
          SUM(yellow_cards)::int AS yellow_cards,
          SUM(red_cards)::int AS red_cards
        FROM core.player_fixture_discipline
        GROUP BY player_id, season_id
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW core.player_season_discipline")
    op.execute("DROP VIEW core.player_fixture_discipline")
