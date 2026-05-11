"""Unit tests for the ProjectorSink adapter.

Strategy: feed it fake repositories that record upserts, then verify
the dispatch logic per ``ReplayEventKind``. The projector functions
themselves are not re-tested here — they have their own unit tests
under ``tests/unit/projectors/``.
"""

from dataclasses import dataclass, field
from typing import Any

import pytest

from src.domain.match.match_comment import MatchComment
from src.domain.match.match_event import MatchEvent
from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind
from src.simulation.infrastructure.projector_sink import ProjectorSink


@dataclass(slots=True)
class _FakeCommentRepo:
    """Implements ``MatchCommentRepository`` for tests. Only ``upsert_by_sportmonks_id``
    is exercised by the sink; the read methods return empty lists to satisfy
    the Protocol's structural shape."""

    upserts: list[tuple[int, MatchComment]] = field(default_factory=list)

    async def upsert_by_sportmonks_id(self, comment: MatchComment, *, sportmonks_id: int) -> None:
        self.upserts.append((sportmonks_id, comment))

    async def list_by_fixture(self, fixture_id: int) -> list[MatchComment]:
        _ = fixture_id
        return []

    async def list_by_team(self, team_id: str, *, limit: int = 100) -> list[MatchComment]:
        _ = team_id, limit
        return []

    async def list_by_player(self, player_id: int, *, limit: int = 100) -> list[MatchComment]:
        _ = player_id, limit
        return []


@dataclass(slots=True)
class _FakeEventRepo:
    """Implements ``MatchEventRepository`` for tests. Only ``upsert_by_sportmonks_id``
    is exercised by the sink; the read methods return empty lists to satisfy
    the Protocol's structural shape."""

    upserts: list[tuple[int, MatchEvent]] = field(default_factory=list)

    async def upsert_by_sportmonks_id(self, event: MatchEvent, *, sportmonks_id: int) -> None:
        self.upserts.append((sportmonks_id, event))

    async def list_by_fixture(self, fixture_id: int) -> list[MatchEvent]:
        _ = fixture_id
        return []

    async def list_chronological_by_season(self, season_id: int) -> list[MatchEvent]:
        _ = season_id
        return []


def _comment_event(payload: dict[str, Any]) -> ReplayEvent:
    return ReplayEvent(
        kind=ReplayEventKind.MATCH_COMMENT,
        minute=payload["minute"],
        extra_minute=payload.get("extra_minute"),
        sequence=payload.get("order", 0),
        payload=payload,
    )


def _match_event(payload: dict[str, Any]) -> ReplayEvent:
    return ReplayEvent(
        kind=ReplayEventKind.MATCH_EVENT,
        minute=payload["minute"],
        extra_minute=payload.get("extra_minute"),
        sequence=payload.get("sort_order", 0),
        payload=payload,
    )


@pytest.mark.anyio
async def test_comment_path_upserts_via_comment_repo() -> None:
    comments = _FakeCommentRepo()
    events = _FakeEventRepo()
    sink = ProjectorSink(comments=comments, events=events)

    payload = {
        "id": 4979792,
        "comment": "Goal!",
        "minute": 23,
        "extra_minute": None,
        "is_goal": True,
        "is_important": True,
        "order": 5,
    }
    await sink.emit(_comment_event(payload), fixture_internal_id=42)

    assert len(comments.upserts) == 1
    assert comments.upserts[0][0] == 4979792
    assert comments.upserts[0][1].fixture_id == 42
    assert comments.upserts[0][1].is_goal is True
    assert events.upserts == []


@pytest.mark.anyio
async def test_event_path_upserts_via_event_repo_with_id_resolution() -> None:
    comments = _FakeCommentRepo()
    events = _FakeEventRepo()
    sink = ProjectorSink(
        comments=comments,
        events=events,
        player_id_by_sportmonks={96611: 777},
        team_id_by_sportmonks={18647: "FRA"},
    )

    payload = {
        "id": 71149755,
        "minute": 80,
        "extra_minute": None,
        "sort_order": 3,
        "type": {"code": "goal"},
        "player_id": 96611,
        "participant_id": 18647,
        "info": "Penalty",
    }
    await sink.emit(_match_event(payload), fixture_internal_id=42)

    assert len(events.upserts) == 1
    sportmonks_id, event = events.upserts[0]
    assert sportmonks_id == 71149755
    assert event.fixture_id == 42
    assert event.minute == 80
    assert event.player_id == 777
    assert event.team_id == "FRA"
    assert comments.upserts == []


@pytest.mark.anyio
async def test_malformed_comment_is_skipped_without_writing() -> None:
    comments = _FakeCommentRepo()
    events = _FakeEventRepo()
    sink = ProjectorSink(comments=comments, events=events)

    # Missing "comment" text → project_match_comment raises ValueError,
    # sink swallows it and logs at debug.
    bad_payload = {"id": 1, "minute": 5, "comment": ""}
    bad_event = ReplayEvent(
        kind=ReplayEventKind.MATCH_COMMENT,
        minute=5,
        extra_minute=None,
        sequence=0,
        payload=bad_payload,
    )

    await sink.emit(bad_event, fixture_internal_id=1)

    assert comments.upserts == []
    assert events.upserts == []


@pytest.mark.anyio
async def test_unknown_kind_raises() -> None:
    sink = ProjectorSink(comments=_FakeCommentRepo(), events=_FakeEventRepo())

    # Construct a ReplayEvent with an enum value the sink doesn't handle.
    # We cheat by monkey-patching to keep the test self-contained.
    class _GhostKind:
        value = "ghost"

    rogue = ReplayEvent.__new__(ReplayEvent)
    object.__setattr__(rogue, "kind", _GhostKind())
    object.__setattr__(rogue, "minute", 0)
    object.__setattr__(rogue, "extra_minute", None)
    object.__setattr__(rogue, "sequence", 0)
    object.__setattr__(rogue, "payload", {})

    with pytest.raises(NotImplementedError):
        await sink.emit(rogue, fixture_internal_id=1)
