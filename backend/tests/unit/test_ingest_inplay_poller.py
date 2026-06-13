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
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.domain.match.fixture import Fixture, FixtureStatus
from src.infrastructure.sportmonks.client import SportmonksError
from src.ingest.infrastructure import sportmonks_inplay_poller as poller_mod
from src.ingest.infrastructure.sportmonks_id_maps import SportmonksIdMaps
from src.ingest.infrastructure.sportmonks_inplay_poller import (
    SportmonksInplayPoller,
    _ticked_player_ids_from,
)
from src.valuation.coefficients import DEFAULT_COEFFICIENTS

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
        # Fixture get_by_id (settlement / lineup-drop reads) uses one_or_none();
        # None → those persistent-event use cases no-op cleanly in this fake.
        result_mock.one_or_none = MagicMock(return_value=None)
        # Latest-price lookup (skip-unchanged guard in _price_players) reads
        # result.all(); no prior ticks in the fake → every price is "new".
        result_mock.all = MagicMock(return_value=[])
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
                    {"id": 200, "meta": {"location": "home"}, "short_code": "FRA"},
                    {"id": 201, "meta": {"location": "away"}, "short_code": "ARG"},
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


# --- ticked-player extraction (drives the value-snapshot step) ------------


def test_ticked_player_ids_from_recovers_only_price_tick_subjects() -> None:
    notifications = [
        ("fundxi.player_price_tick.100", b""),
        ("fundxi.fixture_status.42", b""),  # not a price tick → ignored
        ("fundxi.player_price_tick.101", b""),  # live
        ("fundxi.player_price_tick.7", b""),  # settlement/suspension/drop — same subject
        ("fundxi.match_event.42", b""),  # ignored
    ]
    assert _ticked_player_ids_from(notifications) == {100, 101, 7}


def test_ticked_player_ids_from_empty_when_no_price_ticks() -> None:
    assert _ticked_player_ids_from([("fundxi.match_comment.42", b"")]) == set()
    assert _ticked_player_ids_from([]) == set()


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
        "include": (
            "state;participants;scores;periods;events.type;comments;lineups.position;lineups.details;statistics.type"
        )
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
async def test_priced_players_feed_the_value_snapshot_step(monkeypatch: pytest.MonkeyPatch) -> None:
    """A poll that moves prices hands exactly those player_ids to the
    portfolio-value snapshot step (wiring of F6). Spying the method keeps the
    assertion independent of the snapshot service's own DB reads."""
    captured: dict[str, set[int]] = {}

    async def _spy(self: SportmonksInplayPoller, ticked_player_ids: set[int]) -> None:
        captured["ids"] = ticked_player_ids

    monkeypatch.setattr(SportmonksInplayPoller, "_materialize_value_snapshots", _spy)

    client = _StubClient(
        response=_envelope_with(
            lineups=[
                _lineup_payload(smk_id=900, player_smk=500, with_details=True),
                _lineup_payload(smk_id=901, player_smk=501, with_details=True),
            ]
        )
    )
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

    # players 500/501 → internal 100/101, both priced this poll.
    assert captured["ids"] == {100, 101}


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


# --- settlement timing + live-pricing gate (Bug A/B regression) -----------
#
# Two coupled fixes for the Mexico-RSA opener bugs:
#   A) post-FT live polls were overwriting the settlement ticks (win bonus,
#      suspension, did-not-play) → all results silently erased for any player
#      who took the pitch. Fix: stop live pricing once settled.
#   B) settlement fired on the FIRST finished poll, before a 90'+ red card and
#      the final ratings had landed → premature, incomplete result. Fix: defer
#      settlement by a stabilization grace window.


def _settlement_poller(**overrides: Any) -> SportmonksInplayPoller:
    kwargs: dict[str, Any] = {
        "fixture_internal_id": 42,
        "fixture_sportmonks_id": 1000,
        "poll_seconds": 10.0,
        "client": _StubClient(response=_envelope_with()),
        "publisher": _RecordingPublisher(),
        "session_factory": _fake_session_factory(write_log=[]),
        "id_maps": _id_maps(),
    }
    kwargs.update(overrides)
    return SportmonksInplayPoller(**kwargs)


def _finished_fixture() -> Fixture:
    return Fixture(
        id=42,
        home_team_id="FRA",
        away_team_id="ARG",
        status=FixtureStatus.FINISHED,
        group="D",
        home_score=1,
        away_score=0,
    )


@pytest.mark.anyio
async def test_settled_poller_does_not_run_live_pricing(monkeypatch: pytest.MonkeyPatch) -> None:
    # Bug A: once settled, no more live (engine) ticks — they would overwrite the
    # settlement and erase the result.
    priced = AsyncMock(return_value=[])
    monkeypatch.setattr(SportmonksInplayPoller, "_price_players", priced)  # slots → patch the class
    poller = _settlement_poller()
    poller._settled = True

    async with poller.session_factory() as session:
        await poller._project_and_persist(session=session, endpoint="/x", params={}, envelope=_envelope_with())

    priced.assert_not_awaited()


@pytest.mark.anyio
async def test_unsettled_poller_runs_live_pricing(monkeypatch: pytest.MonkeyPatch) -> None:
    # Mirror of the above: before settlement, live pricing DOES run (so the final
    # rating is still captured during the grace window).
    priced = AsyncMock(return_value=[])
    monkeypatch.setattr(SportmonksInplayPoller, "_price_players", priced)  # slots → patch the class
    poller = _settlement_poller()
    poller._settled = False

    async with poller.session_factory() as session:
        await poller._project_and_persist(session=session, endpoint="/x", params={}, envelope=_envelope_with())

    priced.assert_awaited_once()


@pytest.mark.anyio
async def test_first_finished_poll_defers_settlement(monkeypatch: pytest.MonkeyPatch) -> None:
    # Bug B: the first finished poll only arms the grace window — it must NOT
    # settle yet (a 90'+ red / final ratings may still be in flight).
    settle = AsyncMock(return_value=[])
    monkeypatch.setattr(poller_mod, "settle_fixture", settle)
    monkeypatch.setattr(poller_mod, "apply_suspensions", AsyncMock(return_value=[]))
    monkeypatch.setattr(poller_mod, "apply_did_not_play", AsyncMock(return_value=[]))
    poller = _settlement_poller()

    result = await poller._settle_if_finished(
        session=MagicMock(), fixture=_finished_fixture(), scores_payload=None, coefficients=DEFAULT_COEFFICIENTS
    )

    assert result == []
    settle.assert_not_awaited()
    assert poller._settled is False
    assert poller._finished_since is not None  # window is now armed


@pytest.mark.anyio
async def test_settlement_fires_after_grace_window(monkeypatch: pytest.MonkeyPatch) -> None:
    settle = AsyncMock(return_value=[])
    suspensions = AsyncMock(return_value=[])
    did_not_play = AsyncMock(return_value=[])
    monkeypatch.setattr(poller_mod, "settle_fixture", settle)
    monkeypatch.setattr(poller_mod, "apply_suspensions", suspensions)
    monkeypatch.setattr(poller_mod, "apply_did_not_play", did_not_play)
    poller = _settlement_poller()
    # Pretend full-time was observed longer ago than the grace window.
    poller._finished_since = datetime.now(UTC) - timedelta(seconds=poller.settle_grace_seconds + 1)

    await poller._settle_if_finished(
        session=MagicMock(), fixture=_finished_fixture(), scores_payload=None, coefficients=DEFAULT_COEFFICIENTS
    )

    settle.assert_awaited_once()
    suspensions.assert_awaited_once()
    did_not_play.assert_awaited_once()
    assert poller._settled is True


@pytest.mark.anyio
async def test_settled_fixture_never_resettles(monkeypatch: pytest.MonkeyPatch) -> None:
    settle = AsyncMock(return_value=[])
    monkeypatch.setattr(poller_mod, "settle_fixture", settle)
    monkeypatch.setattr(poller_mod, "apply_suspensions", AsyncMock(return_value=[]))
    monkeypatch.setattr(poller_mod, "apply_did_not_play", AsyncMock(return_value=[]))
    poller = _settlement_poller()
    poller._settled = True
    poller._finished_since = datetime.now(UTC) - timedelta(seconds=poller.settle_grace_seconds + 1)

    result = await poller._settle_if_finished(
        session=MagicMock(), fixture=_finished_fixture(), scores_payload=None, coefficients=DEFAULT_COEFFICIENTS
    )

    assert result == []
    settle.assert_not_awaited()


@pytest.mark.anyio
async def test_shutdown_settles_when_finished_but_unsettled(monkeypatch: pytest.MonkeyPatch) -> None:
    # Safety net: poller cancelled after FT but before the grace elapsed must
    # still settle once (no more polls will come).
    class _FakeRepo:
        def __init__(self, fixture: Fixture) -> None:
            self._fixture = fixture

        def __call__(self, _session: Any) -> "_FakeRepo":
            return self

        async def get_by_id(self, _fixture_id: int) -> Fixture:
            return self._fixture

    monkeypatch.setattr(poller_mod, "SqlAlchemyFixtureRepository", _FakeRepo(_finished_fixture()))
    monkeypatch.setattr(poller_mod, "commit_then_publish", AsyncMock())
    run_settlement = AsyncMock(return_value=[])
    monkeypatch.setattr(SportmonksInplayPoller, "_run_settlement", run_settlement)  # slots → patch the class
    monkeypatch.setattr(SportmonksInplayPoller, "_materialize_value_snapshots", AsyncMock())
    poller = _settlement_poller()

    await poller._settle_on_shutdown()

    run_settlement.assert_awaited_once()


@pytest.mark.anyio
async def test_shutdown_noop_when_already_settled(monkeypatch: pytest.MonkeyPatch) -> None:
    run_settlement = AsyncMock(return_value=[])
    monkeypatch.setattr(SportmonksInplayPoller, "_run_settlement", run_settlement)  # slots → patch the class
    poller = _settlement_poller()
    poller._settled = True

    await poller._settle_on_shutdown()

    run_settlement.assert_not_awaited()


# --- season-aggregate refresh on full-time settlement ---------------------
#
# The PlayerSheet Statistics panel reads core.player_tournament_stat, refreshed
# daily by the ReferenceRefresher. To cut staleness from ~24h to ~match-end,
# a fixture's two teams are re-pulled the instant it settles at full-time.


def _finished_fixture_with_season(season_id: int | None = 26618) -> Fixture:
    return Fixture(
        id=42,
        home_team_id="FRA",
        away_team_id="ARG",
        status=FixtureStatus.FINISHED,
        group="D",
        home_score=1,
        away_score=0,
        season_id=season_id,
    )


@pytest.mark.anyio
async def test_refresh_tournament_stats_scopes_to_fixture_teams(monkeypatch: pytest.MonkeyPatch) -> None:
    # Only THIS fixture's two teams are re-pulled (two squad calls), mapped from
    # internal id back to the sportmonks team id the squad endpoint needs.
    captured: dict[str, Any] = {}

    async def _fake_bootstrap(**kwargs: Any) -> int:
        captured.update(kwargs)
        return 46

    monkeypatch.setattr(poller_mod, "bootstrap_player_stats", _fake_bootstrap)
    poller = _settlement_poller()

    await poller._refresh_tournament_stats(_finished_fixture_with_season())

    # id_maps: {200: "FRA", 201: "ARG"} → reverse gives FRA→200, ARG→201.
    assert captured["teams"] == [(200, "FRA"), (201, "ARG")]
    assert captured["season_id"] == 26618


@pytest.mark.anyio
async def test_refresh_tournament_stats_noop_without_season(monkeypatch: pytest.MonkeyPatch) -> None:
    bootstrap = AsyncMock(return_value=0)
    monkeypatch.setattr(poller_mod, "bootstrap_player_stats", bootstrap)
    poller = _settlement_poller()

    await poller._refresh_tournament_stats(_finished_fixture_with_season(season_id=None))
    await poller._refresh_tournament_stats(None)

    bootstrap.assert_not_awaited()


@pytest.mark.anyio
async def test_refresh_tournament_stats_swallows_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    # Secondary projection: a squad-endpoint failure must never break ingest.
    monkeypatch.setattr(poller_mod, "bootstrap_player_stats", AsyncMock(side_effect=RuntimeError("squad 503")))
    poller = _settlement_poller()

    # Must not raise.
    await poller._refresh_tournament_stats(_finished_fixture_with_season())


@pytest.mark.anyio
async def test_settlement_edge_triggers_one_stats_refresh(monkeypatch: pytest.MonkeyPatch) -> None:
    # The false→true _settled edge fires the refresh exactly once.
    refresh = AsyncMock()
    monkeypatch.setattr(SportmonksInplayPoller, "_refresh_tournament_stats", refresh)  # slots → patch the class
    monkeypatch.setattr(SportmonksInplayPoller, "_materialize_value_snapshots", AsyncMock())

    async def _settle_flips(self: SportmonksInplayPoller, **_kwargs: Any) -> list[tuple[str, bytes]]:
        self._settled = True
        return []

    monkeypatch.setattr(SportmonksInplayPoller, "_settle_if_finished", _settle_flips)
    poller = _settlement_poller()

    async with poller.session_factory() as session:
        await poller._project_and_persist(
            session=session, endpoint="/x", params={}, envelope=_envelope_with(include_fixture_envelope=True)
        )

    refresh.assert_awaited_once()


@pytest.mark.anyio
async def test_no_stats_refresh_when_already_settled(monkeypatch: pytest.MonkeyPatch) -> None:
    # A post-FT poll on an already-settled fixture must NOT re-trigger the refresh
    # (no edge): the once-per-fixture guard mirrors the settlement guard.
    refresh = AsyncMock()
    monkeypatch.setattr(SportmonksInplayPoller, "_refresh_tournament_stats", refresh)  # slots → patch the class
    monkeypatch.setattr(SportmonksInplayPoller, "_materialize_value_snapshots", AsyncMock())
    monkeypatch.setattr(SportmonksInplayPoller, "_settle_if_finished", AsyncMock(return_value=[]))
    poller = _settlement_poller()
    poller._settled = True

    async with poller.session_factory() as session:
        await poller._project_and_persist(
            session=session, endpoint="/x", params={}, envelope=_envelope_with(include_fixture_envelope=True)
        )

    refresh.assert_not_awaited()
