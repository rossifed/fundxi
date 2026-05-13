"""SQLAlchemy adapter for the ``FixtureProgressWriter`` port.

DDD role: Adapter (driven). Reflects a replay's progress onto the
``core.fixture`` row — the same columns the live ingest worker would
set when a real match is in play: ``status``, ``minute`` and the
running score, recomputed from the ``core.match_event`` rows the
replay has written so far.

The score derivation (which event types and which side count) lives
here at the infrastructure boundary, never in the domain.
"""

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Event types that put the ball in the net. ``penalty`` is a scored
# penalty; ``penalty_missed`` is excluded. An ``own_goal`` counts for
# the *opposing* team, hence the cross-join on team id below.
_SCORING_TYPES = ("goal", "penalty")
_OWN_GOAL_TYPE = "own_goal"

_ADVANCE_SQL = text(
    """
    UPDATE core.fixture f SET
        status = 'live',
        minute = :minute,
        home_score = (
            SELECT count(*) FROM core.match_event e
            WHERE e.fixture_id = f.id
              AND ((e.type = ANY(:scoring_types) AND e.team_id = f.home_team_id)
                OR (e.type = :own_goal_type AND e.team_id = f.away_team_id))
        ),
        away_score = (
            SELECT count(*) FROM core.match_event e
            WHERE e.fixture_id = f.id
              AND ((e.type = ANY(:scoring_types) AND e.team_id = f.away_team_id)
                OR (e.type = :own_goal_type AND e.team_id = f.home_team_id))
        )
    WHERE f.id = :fixture_id
    """
)

_FINISH_SQL = text("UPDATE core.fixture SET status = 'finished' WHERE id = :fixture_id")


@dataclass(frozen=True, slots=True)
class SqlAlchemyFixtureProgressWriter:
    session: AsyncSession

    async def advance(self, *, fixture_internal_id: int, minute: int) -> None:
        await self.session.execute(
            _ADVANCE_SQL,
            {
                "minute": minute,
                "fixture_id": fixture_internal_id,
                "scoring_types": list(_SCORING_TYPES),
                "own_goal_type": _OWN_GOAL_TYPE,
            },
        )

    async def finish(self, *, fixture_internal_id: int) -> None:
        await self.session.execute(_FINISH_SQL, {"fixture_id": fixture_internal_id})
