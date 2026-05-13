"""Unit tests for the SportmonksInplayPoller.

Strategy: drive the poller with a stubbed Sportmonks client returning
a canned WC-shaped envelope, an in-memory ``ProjectorSink``-style
fake for the DB writes (via ``SessionLocal`` stub), and a recording
NATS publisher. Verify:

  - The HTTP endpoint and includes are exactly what we want.
  - Both events and comments are projected.
  - One ``fundxi.match_event.<id>`` and one ``fundxi.match_comment.<id>``
    notification are emitted, with correct counts.
  - Empty payloads emit no notification (no NATS noise on quiet ticks).
  - HTTP failure does not raise — the next tick will retry.
"""

import json
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.infrastructure.sportmonks.client import SportmonksError
from src.ingest.infrastructure.sportmonks_id_maps import SportmonksIdMaps
from src.ingest.infrastructure.sportmonks_inplay_poller import SportmonksInplayPoller

# --- fakes ----------------------------------------------------------------


@dataclass(slots=True)
class _StubClient:
    response: dict[str, Any]
    raise_on_get: Exception | None = None
    captured_endpoint: str = ""
    captured_params: dict[str, Any] | None = None

    async def get(self, endpoint: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self.captured_endpoint = endpoint
        self.captured_params = params
        if self.raise_on_get is not None:
            raise self.raise_on_get
        return self.response


@dataclass(slots=True)
class _RecordingPublisher:
    log: list[tuple[str, bytes]] = field(default_factory=list)

    async def publish(self, subject: str, payload: bytes) -> None:
        self.log.append((subject, payload))


def _fake_session_factory(write_log: list[tuple[str, Any]]) -> Any:
    """Build a ``SessionLocal``-shaped object whose context returns an
    AsyncSession-like fake.

    SQLAlchemy repos call ``await session.execute(stmt)`` then sync
    methods on the returned ``Result``. We hand-build the mock so the
    chained sync calls (``.scalar_one_or_none``) don't auto-magic into
    un-awaited coroutines."""

    @asynccontextmanager
    async def _session_ctx() -> AsyncGenerator[Any, None]:
        result_mock = MagicMock()
        result_mock.scalar_one_or_none = MagicMock(return_value=None)
        result_mock.scalar = MagicMock(return_value=None)
        session = MagicMock()
        session.execute = AsyncMock(return_value=result_mock)
        session.commit = AsyncMock(side_effect=lambda: write_log.append(("commit", None)))
        session.rollback = AsyncMock()
        yield session

    factory = MagicMock(side_effect=_session_ctx)
    factory._write_log = write_log
    return factory


def _id_maps() -> SportmonksIdMaps:
    return SportmonksIdMaps(
        fixture_smk_by_internal={42: 1000},
        fixture_group_by_internal={42: "D"},
        player_id_by_sportmonks={500: 100, 501: 101},
        team_id_by_sportmonks={200: "FRA", 201: "ARG"},
    )


def _envelope_with(
    *,
    events: list[dict[str, Any]] | None = None,
    comments: list[dict[str, Any]] | None = None,
    lineups: list[dict[str, Any]] | None = None,
    include_fixture_envelope: bool = False,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": 1000,
        "events": events or [],
        "comments": comments or [],
        "lineups": lineups or [],
    }
    if include_fixture_envelope:
        # Minimal fixture-projectable payload (participants + state + scores).
        data.update(
            {
                "state": {"state": "INPLAY_1ST_HALF"},
                "participants": [
                    {"meta": {"location": "home"}, "short_code": "FRA"},
                    {"meta": {"location": "away"}, "short_code": "ARG"},
                ],
                "scores": [
                    {"description": "CURRENT", "score": {"participant": "home", "goals": 1}},
                    {"description": "CURRENT", "score": {"participant": "away", "goals": 0}},
                ],
                "starting_at": "2022-12-18 15:00:00",
                "minute": 45,
            }
        )
    return {"data": data}


def _event_payload(
    *, smk_id: int, minute: int, code: str, player_smk: int = 500, team_smk: int = 200
) -> dict[str, Any]:
    return {
        "id": smk_id,
        "minute": minute,
        "extra_minute": None,
        "sort_order": 1,
        "type": {"code": code},
        "player_id": player_smk,
        "participant_id": team_smk,
    }


def _comment_payload(*, smk_id: int, minute: int, text: str = "Goal!") -> dict[str, Any]:
    return {
        "id": smk_id,
        "comment": text,
        "minute": minute,
        "extra_minute": None,
        "is_goal": True,
        "is_important": True,
        "order": 1,
    }


def _lineup_payload(
    *, smk_id: int, player_smk: int = 500, team_smk: int = 200, with_details: bool = False
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": smk_id,
        "player_id": player_smk,
        "team_id": team_smk,
        "type_id": 11,  # starter
        "position_id": 25,  # defender
        "jersey_number": 4,
        "formation_position": 1,
    }
    if with_details:
        payload["details"] = [
            {"type_id": 119, "data": {"value": 90}},  # minutes played
            {"type_id": 118, "data": {"value": 7.5}},  # rating
            {"type_id": 52, "data": {"value": 1}},  # goals
            {"type_id": 42, "data": {"value": 3}},  # shots total
            {"type_id": 80, "data": {"value": 40}},  # passes total
            {"type_id": 1584, "data": {"value": 88}},  # passes accuracy %
        ]
    return payload


# --- tests ----------------------------------------------------------------


@pytest.mark.anyio
async def test_poll_uses_correct_endpoint_and_include() -> None:
    client = _StubClient(response=_envelope_with(events=[], comments=[]))
    poller = SportmonksInplayPoller(
        fixture_internal_id=42,
        fixture_sportmonks_id=1000,
        poll_seconds=10.0,
        client=client,
        publisher=_RecordingPublisher(),
        session_factory=_fake_session_factory(write_log=[]),
        id_maps=_id_maps(),
    )

    await poller.poll_once()

    assert client.captured_endpoint == "/fixtures/1000"
    assert client.captured_params == {
        "include": "state;participants;scores;events.type;comments;lineups.position;lineups.details"
    }


@pytest.mark.anyio
async def test_quiet_tick_publishes_nothing() -> None:
    client = _StubClient(response=_envelope_with(events=[], comments=[]))
    publisher = _RecordingPublisher()
    poller = SportmonksInplayPoller(
        fixture_internal_id=42,
        fixture_sportmonks_id=1000,
        poll_seconds=10.0,
        client=client,
        publisher=publisher,
        session_factory=_fake_session_factory(write_log=[]),
        id_maps=_id_maps(),
    )

    await poller.poll_once()

    assert publisher.log == []


@pytest.mark.anyio
async def test_events_and_comments_each_emit_one_notification_with_count() -> None:
    client = _StubClient(
        response=_envelope_with(
            events=[
                _event_payload(smk_id=1, minute=10, code="goal"),
                _event_payload(smk_id=2, minute=23, code="yellowcard"),
            ],
            comments=[_comment_payload(smk_id=10, minute=10)],
        )
    )
    publisher = _RecordingPublisher()
    poller = SportmonksInplayPoller(
        fixture_internal_id=42,
        fixture_sportmonks_id=1000,
        poll_seconds=10.0,
        client=client,
        publisher=publisher,
        session_factory=_fake_session_factory(write_log=[]),
        id_maps=_id_maps(),
    )

    await poller.poll_once()

    subjects = sorted(s for s, _ in publisher.log)
    assert subjects == ["fundxi.match_comment.42", "fundxi.match_event.42"]

    payload_by_subject = {s: p for s, p in publisher.log}
    event_msg = json.loads(payload_by_subject["fundxi.match_event.42"])
    comment_msg = json.loads(payload_by_subject["fundxi.match_comment.42"])
    assert event_msg == {"kind": "match_event", "fixture_id": 42, "count": 2}
    assert comment_msg == {"kind": "match_comment", "fixture_id": 42, "count": 1}


@pytest.mark.anyio
async def test_http_failure_does_not_raise() -> None:
    client = _StubClient(
        response={},
        raise_on_get=SportmonksError("simulated 503"),
    )
    publisher = _RecordingPublisher()
    poller = SportmonksInplayPoller(
        fixture_internal_id=42,
        fixture_sportmonks_id=1000,
        poll_seconds=10.0,
        client=client,
        publisher=publisher,
        session_factory=_fake_session_factory(write_log=[]),
        id_maps=_id_maps(),
    )

    # Must not raise — the daemon stays up and retries on the next tick.
    await poller.poll_once()

    assert publisher.log == []


@pytest.mark.anyio
async def test_lineups_present_emit_one_notification_with_count() -> None:
    client = _StubClient(
        response=_envelope_with(
            lineups=[
                _lineup_payload(smk_id=900, player_smk=500),
                _lineup_payload(smk_id=901, player_smk=501),
            ]
        )
    )
    publisher = _RecordingPublisher()
    poller = SportmonksInplayPoller(
        fixture_internal_id=42,
        fixture_sportmonks_id=1000,
        poll_seconds=10.0,
        client=client,
        publisher=publisher,
        session_factory=_fake_session_factory(write_log=[]),
        id_maps=_id_maps(),
    )

    await poller.poll_once()

    subjects = sorted(s for s, _ in publisher.log)
    assert subjects == ["fundxi.lineup.42"]
    msg = json.loads(publisher.log[0][1])
    assert msg == {"kind": "lineup", "fixture_id": 42, "count": 2}


@pytest.mark.anyio
async def test_player_match_stats_emit_one_notification_with_count() -> None:
    client = _StubClient(
        response=_envelope_with(
            lineups=[
                _lineup_payload(smk_id=900, player_smk=500, with_details=True),
                _lineup_payload(smk_id=901, player_smk=501, with_details=True),
                # bench player with no details → not counted
                _lineup_payload(smk_id=902, player_smk=500, with_details=False),
            ]
        )
    )
    publisher = _RecordingPublisher()
    poller = SportmonksInplayPoller(
        fixture_internal_id=42,
        fixture_sportmonks_id=1000,
        poll_seconds=10.0,
        client=client,
        publisher=publisher,
        session_factory=_fake_session_factory(write_log=[]),
        id_maps=_id_maps(),
    )

    await poller.poll_once()

    subjects = sorted(s for s, _ in publisher.log)
    # lineups also emit a fundxi.lineup notification (3 lineups upserted).
    assert "fundxi.player_match_stat.42" in subjects
    stat_msg = next(json.loads(p) for s, p in publisher.log if s == "fundxi.player_match_stat.42")
    assert stat_msg == {"kind": "player_match_stat", "fixture_id": 42, "count": 2}


@pytest.mark.anyio
async def test_fixture_envelope_emits_fixture_status_notification_and_upserts() -> None:
    client = _StubClient(response=_envelope_with(include_fixture_envelope=True))
    publisher = _RecordingPublisher()
    poller = SportmonksInplayPoller(
        fixture_internal_id=42,
        fixture_sportmonks_id=1000,
        poll_seconds=10.0,
        client=client,
        publisher=publisher,
        session_factory=_fake_session_factory(write_log=[]),
        id_maps=_id_maps(),
    )

    await poller.poll_once()

    subjects = sorted(s for s, _ in publisher.log)
    assert subjects == ["fundxi.fixture_status.42"]
    msg = json.loads(publisher.log[0][1])
    assert msg == {"kind": "fixture_status", "fixture_id": 42}


@pytest.mark.anyio
async def test_full_envelope_emits_four_notifications() -> None:
    client = _StubClient(
        response=_envelope_with(
            events=[_event_payload(smk_id=1, minute=10, code="goal")],
            comments=[_comment_payload(smk_id=10, minute=10)],
            lineups=[_lineup_payload(smk_id=900)],
            include_fixture_envelope=True,
        )
    )
    publisher = _RecordingPublisher()
    poller = SportmonksInplayPoller(
        fixture_internal_id=42,
        fixture_sportmonks_id=1000,
        poll_seconds=10.0,
        client=client,
        publisher=publisher,
        session_factory=_fake_session_factory(write_log=[]),
        id_maps=_id_maps(),
    )

    await poller.poll_once()

    subjects = sorted(s for s, _ in publisher.log)
    assert subjects == [
        "fundxi.fixture_status.42",
        "fundxi.lineup.42",
        "fundxi.match_comment.42",
        "fundxi.match_event.42",
    ]


@pytest.mark.anyio
async def test_malformed_event_payload_skipped_others_proceed() -> None:
    client = _StubClient(
        response=_envelope_with(
            events=[
                {"id": "not-an-int"},  # bad → skipped silently
                _event_payload(smk_id=2, minute=23, code="goal"),
            ],
            comments=[],
        )
    )
    publisher = _RecordingPublisher()
    poller = SportmonksInplayPoller(
        fixture_internal_id=42,
        fixture_sportmonks_id=1000,
        poll_seconds=10.0,
        client=client,
        publisher=publisher,
        session_factory=_fake_session_factory(write_log=[]),
        id_maps=_id_maps(),
    )

    await poller.poll_once()

    # Only the well-formed event is counted → 1 match_event notification.
    assert len(publisher.log) == 1
    subject, payload = publisher.log[0]
    assert subject == "fundxi.match_event.42"
    assert json.loads(payload)["count"] == 1
