"""Project a ``ReplayEvent`` and persist it through the live ingest pipeline.

DDD role: Adapter (driven) implementing the ``LiveDataSink`` port. The
projector functions imported here are the exact same ones the live
ingest worker uses — that is the whole point of the simulation
context: the data path tested in replay IS the production data path.

Slice 1 supports ``MATCH_COMMENT`` only. Slice 2 will add
``MATCH_EVENT`` handling alongside.
"""

from dataclasses import dataclass

import structlog

from src.domain.match.match_comment import MatchCommentRepository
from src.infrastructure.sportmonks.projectors.match_comment import project_match_comment
from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind

log = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class ProjectorSink:
    comments: MatchCommentRepository

    async def emit(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        if event.kind is ReplayEventKind.MATCH_COMMENT:
            await self._emit_comment(event, fixture_internal_id=fixture_internal_id)
            return
        # Defensive: future kinds added to the enum must be wired here.
        raise NotImplementedError(f"sink has no handler for kind={event.kind!r}")

    async def _emit_comment(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        payload = dict(event.payload)
        try:
            comment, sportmonks_id = project_match_comment(payload, fixture_id=fixture_internal_id)
        except (ValueError, TypeError) as exc:
            log.debug("simulation.sink.comment_skip", reason=str(exc))
            return
        await self.comments.upsert_by_sportmonks_id(comment, sportmonks_id=sportmonks_id)
