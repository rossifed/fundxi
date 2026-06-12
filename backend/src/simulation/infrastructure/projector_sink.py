"""Project a ``ReplayEvent`` and persist it through the live ingest pipeline.

DDD role: Adapter (driven) implementing the ``LiveDataSink`` port. The
projector functions imported here are the exact same ones the live
ingest worker uses — that is the whole point of the simulation
context: the data path tested in replay IS the production data path.

Slice 2: supports ``MATCH_COMMENT`` and ``MATCH_EVENT``. Slice 3 will
add price-tick emission on impactful events.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType

import structlog

from src.domain.match.match_comment import MatchCommentRepository
from src.domain.match.match_event import MatchEventRepository
from src.infrastructure.sportmonks.projectors.match_comment import (
    is_goal_overturn_comment,
    project_match_comment,
)
from src.infrastructure.sportmonks.projectors.match_event import project_match_event
from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind

log = structlog.get_logger(__name__)

_EMPTY_INT_TO_INT: Mapping[int, int] = MappingProxyType({})
_EMPTY_INT_TO_STR: Mapping[int, str] = MappingProxyType({})


@dataclass(frozen=True, slots=True)
class ProjectorSink:
    """Concrete ``LiveDataSink`` that delegates to live-ingest projectors.

    ``player_id_by_sportmonks`` and ``team_id_by_sportmonks`` are
    snapshotted at construction time. They are required for projecting
    match events (which carry Sportmonks ids) and unused for comments;
    callers that only need comments can leave them empty (defaults).
    """

    comments: MatchCommentRepository
    events: MatchEventRepository
    player_id_by_sportmonks: Mapping[int, int] = _EMPTY_INT_TO_INT
    team_id_by_sportmonks: Mapping[int, str] = _EMPTY_INT_TO_STR

    async def emit(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        if event.kind is ReplayEventKind.MATCH_COMMENT:
            await self._emit_comment(event, fixture_internal_id=fixture_internal_id)
            return
        if event.kind is ReplayEventKind.MATCH_EVENT:
            await self._emit_match_event(event, fixture_internal_id=fixture_internal_id)
            return
        raise NotImplementedError(f"sink has no handler for kind={event.kind!r}")

    async def _emit_comment(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        payload = dict(event.payload)
        try:
            comment, sportmonks_id = project_match_comment(payload, fixture_id=fixture_internal_id)
        except (ValueError, TypeError) as exc:
            log.debug("simulation.sink.comment_skip", reason=str(exc))
            return
        await self.comments.upsert_by_sportmonks_id(comment, sportmonks_id=sportmonks_id)
        # A VAR overturn streams right after the goal it cancels; retract that
        # goal now so the replay drops the phantom scorer in real time (same
        # write-time reconciliation the live poller applies per poll).
        if is_goal_overturn_comment(comment.comment):
            await self.comments.reconcile_overturned_goals(fixture_internal_id)

    async def _emit_match_event(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        payload = dict(event.payload)
        try:
            match_event, sportmonks_id = project_match_event(
                payload,
                fixture_id=fixture_internal_id,
                player_id_by_sportmonks=dict(self.player_id_by_sportmonks),
                team_id_by_sportmonks=dict(self.team_id_by_sportmonks),
            )
        except (ValueError, TypeError) as exc:
            log.debug("simulation.sink.event_skip", reason=str(exc))
            return
        await self.events.upsert_by_sportmonks_id(match_event, sportmonks_id=sportmonks_id)
