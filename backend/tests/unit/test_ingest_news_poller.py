"""Unit tests for the NewsPoller orchestration.

Stub the Sportmonks client with canned pre/post-match envelopes, fake
the AsyncSession factory, record NATS publishes. Verify the endpoints
hit, the per-item upsert count, the single ``fundxi.news`` notification,
and HTTP-failure resilience.
"""

import json
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.infrastructure.sportmonks.client import SportmonksError
from src.ingest.infrastructure.news_poller import NewsPoller


@dataclass(slots=True)
class _StubClient:
    by_endpoint: dict[str, dict[str, Any]]
    raise_for: set[str] = field(default_factory=set)
    seen: list[str] = field(default_factory=list)

    async def get(self, endpoint: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
        _ = params
        self.seen.append(endpoint)
        if endpoint in self.raise_for:
            raise SportmonksError(f"simulated 503 for {endpoint}")
        return self.by_endpoint.get(endpoint, {"data": []})


@dataclass(slots=True)
class _RecordingPublisher:
    log: list[tuple[str, bytes]] = field(default_factory=list)

    async def publish(self, subject: str, payload: bytes) -> None:
        self.log.append((subject, payload))


class _FakeFixtureRepoForNews:
    """Only ``map_sportmonks_to_internal_id`` is exercised by the poller."""

    async def map_sportmonks_to_internal_id(self) -> dict[int, int]:
        return {1000: 65}


def _fake_session_factory() -> Any:
    @asynccontextmanager
    async def _ctx() -> AsyncGenerator[Any, None]:
        result_mock = MagicMock()
        result_mock.scalar_one_or_none = MagicMock(return_value=None)
        session = MagicMock()
        session.execute = AsyncMock(return_value=result_mock)
        session.commit = AsyncMock()
        session.rollback = AsyncMock()
        yield session

    return MagicMock(side_effect=_ctx)


def _news_item(*, smk_id: int, title: str, type_: str, fixture_id: int | None = None) -> dict[str, Any]:
    item: dict[str, Any] = {"id": smk_id, "title": title, "type": type_}
    if fixture_id is not None:
        item["fixture_id"] = fixture_id
    return item


_PRE = "/news/pre-match/seasons/18017"
_POST = "/news/post-match/seasons/18017"


def _poller(
    *, by_endpoint: dict[str, dict[str, Any]], raise_for: set[str] | None = None
) -> tuple[NewsPoller, _RecordingPublisher, _StubClient]:
    client = _StubClient(by_endpoint=by_endpoint, raise_for=raise_for or set())
    publisher = _RecordingPublisher()
    # Patch the fixture repo the poller constructs internally.
    poller = NewsPoller(
        season_id=18017,
        poll_seconds=900.0,
        client=client,
        publisher=publisher,
        session_factory=_fake_session_factory(),
    )
    return poller, publisher, client


@pytest.mark.anyio
async def test_hits_pre_and_post_match_endpoints(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "src.ingest.infrastructure.news_poller.SqlAlchemyFixtureRepository",
        lambda _s: _FakeFixtureRepoForNews(),
    )
    poller, _, client = _poller(by_endpoint={_PRE: {"data": []}, _POST: {"data": []}})

    await poller.poll_once()

    assert sorted(client.seen) == sorted([_PRE, _POST])


@pytest.mark.anyio
async def test_projects_items_and_emits_one_notification_with_count(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "src.ingest.infrastructure.news_poller.SqlAlchemyFixtureRepository",
        lambda _s: _FakeFixtureRepoForNews(),
    )
    poller, publisher, _ = _poller(
        by_endpoint={
            _PRE: {
                "data": [
                    _news_item(smk_id=1, title="Preview: France vs Argentina", type_="prematch", fixture_id=1000),
                    _news_item(smk_id=2, title="Group D round-up", type_="prematch"),
                ]
            },
            _POST: {
                "data": [
                    _news_item(smk_id=3, title="Report: France 2-2 Argentina", type_="postmatch", fixture_id=1000),
                    {"id": 4},  # missing title → skipped
                ]
            },
        }
    )

    await poller.poll_once()

    assert len(publisher.log) == 1
    subject, payload = publisher.log[0]
    assert subject == "fundxi.news"
    assert json.loads(payload) == {"kind": "news", "count": 3}


@pytest.mark.anyio
async def test_empty_envelopes_publish_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "src.ingest.infrastructure.news_poller.SqlAlchemyFixtureRepository",
        lambda _s: _FakeFixtureRepoForNews(),
    )
    poller, publisher, _ = _poller(by_endpoint={_PRE: {"data": []}, _POST: {"data": []}})

    await poller.poll_once()

    assert publisher.log == []


@pytest.mark.anyio
async def test_one_endpoint_failing_does_not_abort_the_other(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "src.ingest.infrastructure.news_poller.SqlAlchemyFixtureRepository",
        lambda _s: _FakeFixtureRepoForNews(),
    )
    poller, publisher, _ = _poller(
        by_endpoint={_POST: {"data": [_news_item(smk_id=9, title="Late report", type_="postmatch")]}},
        raise_for={_PRE},  # pre-match fetch blows up
    )

    await poller.poll_once()  # must not raise

    assert len(publisher.log) == 1
    assert json.loads(publisher.log[0][1])["count"] == 1


@pytest.mark.anyio
async def test_both_endpoints_failing_publishes_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "src.ingest.infrastructure.news_poller.SqlAlchemyFixtureRepository",
        lambda _s: _FakeFixtureRepoForNews(),
    )
    poller, publisher, _ = _poller(by_endpoint={}, raise_for={_PRE, _POST})

    await poller.poll_once()

    assert publisher.log == []
