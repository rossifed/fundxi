"""reconcile_var_disallowed_goals — retract goals annulled by VAR.

DDD role: Application Service / Use Case. Thin I/O around the authoritative
signal Sportmonks gives for a disallowed goal.

When VAR rules a goal out, Sportmonks appends a ``VAR`` event with
``addition="Goal Disallowed"`` (carrying the scorer's ``player_id`` /
``player_name`` and the minute) and, on a later poll, REMOVES the original
goal from its events feed. Our ingestion is upsert-only, so the now-stale goal
lingers as a phantom scorer in BOTH projections of the goal:

  - the structured ``match_event`` (``type=goal``) → drives the scorer list,
  - the commentary line (``match_comment.is_goal``) → drives the feed highlight.

This use case re-derives the annulment from the VAR event each poll and removes
both twins. Idempotent: once the goal event is deleted and the comment flag
cleared, subsequent polls find nothing to do (the VAR event stays in the feed,
so the reconciliation keeps re-asserting the retraction even though the goal
gets re-projected from the commentary text each poll).
"""

from collections.abc import Mapping, Sequence
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.match_event import SqlAlchemyMatchEventRepository
from src.infrastructure.sportmonks.projectors.match_event import is_goal_disallowed_var

log = structlog.get_logger(__name__)


async def reconcile_var_disallowed_goals(
    session: AsyncSession,
    *,
    fixture_id: int,
    events_payload: Sequence[dict[str, Any]],
    player_id_by_sportmonks: Mapping[int, int],
) -> int:
    """Remove every goal (event + comment) annulled by a VAR review in this
    fixture's events payload. Returns the count of rows retracted."""
    events_repo = SqlAlchemyMatchEventRepository(session)
    comments_repo = SqlAlchemyMatchCommentRepository(session)
    retracted = 0
    for event in events_payload:
        if not is_goal_disallowed_var(event):
            continue
        minute = event.get("minute")
        if not isinstance(minute, int):
            continue
        smk_player_id = event.get("player_id")
        internal_player_id = (
            player_id_by_sportmonks.get(smk_player_id) if isinstance(smk_player_id, int) else None
        )
        if internal_player_id is not None:
            retracted += await events_repo.delete_goal(fixture_id, player_id=internal_player_id, minute=minute)
        scorer_name = event.get("player_name")
        if isinstance(scorer_name, str) and scorer_name:
            retracted += await comments_repo.disallow_goal(fixture_id, minute=minute, scorer_name=scorer_name)
    if retracted:
        log.info("ingest.inplay.var_disallowed_goal", fixture_id=fixture_id, retracted=retracted)
    return retracted
