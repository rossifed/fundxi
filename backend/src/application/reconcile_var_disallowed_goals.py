"""reconcile_var_disallowed_goals — clear the commentary twin of a goal
annulled by VAR.

DDD role: Application Service / Use Case. Thin I/O around the authoritative
signal Sportmonks gives for a disallowed goal.

When VAR rules a goal out, Sportmonks appends a ``VAR`` event with
``addition="Goal Disallowed"`` (carrying the scorer's ``player_name`` and the
minute) and, on a later poll, REMOVES the original goal from its events feed.

The stale goal EVENT is pruned by the full-set sync (``sync_fixture_events``:
feed absence is authoritative). The commentary projection is a DIFFERENT feed:
the goal's commentary line stays in ``comments`` with its celebratory text, and
our ``match_comment.is_goal`` flag — which drives the feed highlight — would
keep flagging a phantom scorer. Only the VAR event tells us to clear it; this
use case re-derives that retraction each poll.

Idempotent: once the flag is cleared, subsequent polls find nothing to change
(the comment gets re-projected from the commentary text each poll, so the
retraction keeps re-asserting itself — deliberate).
"""

from collections.abc import Sequence
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.sportmonks.projectors.match_event import is_goal_disallowed_var

log = structlog.get_logger(__name__)


async def reconcile_var_disallowed_goals(
    session: AsyncSession,
    *,
    fixture_id: int,
    events_payload: Sequence[dict[str, Any]],
) -> int:
    """Clear the ``is_goal`` commentary flag of every goal annulled by a VAR
    review in this fixture's events payload. Returns the count of rows cleared."""
    comments_repo = SqlAlchemyMatchCommentRepository(session)

    retracted = 0
    for event in events_payload:
        if not is_goal_disallowed_var(event):
            continue
        minute = event.get("minute")
        if not isinstance(minute, int):
            continue
        scorer_name = event.get("player_name")
        if isinstance(scorer_name, str) and scorer_name:
            retracted += await comments_repo.disallow_goal(fixture_id, minute=minute, scorer_name=scorer_name)
    if retracted:
        log.info("ingest.inplay.var_disallowed_goal", fixture_id=fixture_id, retracted=retracted)
    return retracted
