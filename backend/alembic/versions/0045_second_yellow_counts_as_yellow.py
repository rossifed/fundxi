"""Discipline convention fix — a second yellow is ALSO a yellow.

Product decision (2026-07-13): a player sent off for two yellows physically
received TWO yellow cards plus the red — the display convention is
2 yellows + 1 red (Embolo vs Argentina), not the Sportmonks encoding where
the second yellow lives only in the ``yellowredcard`` bucket.

Updated single-source definition (both views, column shapes unchanged):

  yellow = ``yellow_card`` + ``yellow_red_card`` events
  red    = ``red_card``    + ``yellow_red_card`` events

The match timeline renders ``yellow_red_card`` as the combined 🟨🟥 icon so
counting the timeline still equals these counters. FIFA-style suspension
accumulation is untouched — it deliberately counts single yellows only
(``apply_suspensions`` reads events directly, not these views).

Revision ID: 0045
Revises: 0044
Create Date: 2026-07-13

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0045"
down_revision: str | Sequence[str] | None = "0044"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FIXTURE_VIEW_2Y1R = """
CREATE OR REPLACE VIEW core.player_fixture_discipline AS
SELECT
  e.fixture_id,
  e.player_id,
  f.season_id,
  COUNT(*) FILTER (WHERE e.type IN ('yellow_card', 'yellow_red_card'))::int AS yellow_cards,
  COUNT(*) FILTER (WHERE e.type IN ('red_card', 'yellow_red_card'))::int AS red_cards
FROM core.match_event e
JOIN core.fixture f ON f.id = e.fixture_id
WHERE e.player_id IS NOT NULL
  AND e.type IN ('yellow_card', 'red_card', 'yellow_red_card')
GROUP BY e.fixture_id, e.player_id, f.season_id
"""

_FIXTURE_VIEW_1Y1R = """
CREATE OR REPLACE VIEW core.player_fixture_discipline AS
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


def upgrade() -> None:
    # The season view reads the fixture view, so replacing the fixture view
    # in place updates both (column shapes unchanged).
    op.execute(_FIXTURE_VIEW_2Y1R)


def downgrade() -> None:
    op.execute(_FIXTURE_VIEW_1Y1R)
