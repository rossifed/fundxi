"""Integration tests for sync_fixture_events (DB-backed, rolled back).

Regression for the WC2026 prod audit (2026-07-13, see
backend/analysis/player-stats-sanitization-audit.md): the upsert-only event
ingestion accumulated duplicate cards (same card re-emitted under a NEW
Sportmonks id — Cornelius/Paredes/Lasheen…), floods of unattributed
provisional events, and VAR-rescinded phantoms (a yellow rescinded at 71'
still counted; disallowed goals still on the scorer). Full-set sync converges
the stored timeline to the feed: upsert what's present, prune what's absent.

Skips when the local Postgres is unreachable (CI has no DB).
"""

from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.sync_fixture_events import EventSyncReport, sync_fixture_events
from src.domain.match.match_event import MatchEvent, MatchEventType
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.repositories.match_event import SqlAlchemyMatchEventRepository

pytestmark = pytest.mark.anyio


def _stored(minute: int, event_type: MatchEventType, fixture_id: int, player_id: int | None) -> MatchEvent:
    return MatchEvent(
        id=0,
        fixture_id=fixture_id,
        minute=minute,
        extra_minute=None,
        type=event_type,
        player_id=player_id,
        related_player_id=None,
        team_id=None,
        info=None,
        sequence=1,
    )


def _feed_event(smk_id: int, minute: int, code: str, smk_player_id: int | None) -> dict[str, Any]:
    return {
        "id": smk_id,
        "type": {"id": 0, "code": code, "name": code},
        "minute": minute,
        "player_id": smk_player_id,
        "sort_order": 1,
    }


async def test_sync_prunes_duplicates_and_phantoms_keeps_feed_events(isolated_session: AsyncSession) -> None:
    session = isolated_session
    fixture_id = (await session.execute(select(FixtureORM.id).limit(1))).scalar_one()
    player_id = (await session.execute(select(PlayerORM.id).limit(1))).scalar_one()
    smk_player_id = 99_999_901
    repo = SqlAlchemyMatchEventRepository(session)

    # The live capture stored: the real yellow twice (provisional id 101 was
    # replaced by 102 in the feed), an unattributed provisional yellow (103),
    # and a VAR-rescinded goal (104).
    for smk_id, ev in (
        (101, _stored(9, MatchEventType.YELLOW_CARD, fixture_id, player_id)),
        (102, _stored(9, MatchEventType.YELLOW_CARD, fixture_id, player_id)),
        (103, _stored(63, MatchEventType.YELLOW_CARD, fixture_id, None)),
        (104, _stored(29, MatchEventType.GOAL, fixture_id, player_id)),
    ):
        await repo.upsert_by_sportmonks_id(ev, sportmonks_id=smk_id)
    await session.flush()

    # The final feed carries only the surviving yellow (102) + a new sub (105).
    feed = [
        _feed_event(102, 9, "yellowcard", smk_player_id),
        _feed_event(105, 78, "substitution", smk_player_id),
    ]
    report = await sync_fixture_events(
        event_repo=repo,
        fixture_id=fixture_id,
        events_payload=feed,
        player_id_by_sportmonks={smk_player_id: player_id},
        team_id_by_sportmonks={},
    )

    assert report.upserted == 2
    assert report.deleted == 3  # 101 (replaced), 103 (provisional), 104 (rescinded)
    remaining = await repo.list_by_fixture(fixture_id)
    assert {(e.minute, e.type) for e in remaining} == {
        (9, MatchEventType.YELLOW_CARD),
        (78, MatchEventType.SUBSTITUTION),
    }


async def test_sync_empty_feed_never_erases_the_timeline(isolated_session: AsyncSession) -> None:
    session = isolated_session
    fixture_id = (await session.execute(select(FixtureORM.id).limit(1))).scalar_one()
    player_id = (await session.execute(select(PlayerORM.id).limit(1))).scalar_one()
    repo = SqlAlchemyMatchEventRepository(session)

    await repo.upsert_by_sportmonks_id(
        _stored(44, MatchEventType.YELLOW_CARD, fixture_id, player_id), sportmonks_id=201
    )
    await session.flush()

    report = await sync_fixture_events(
        event_repo=repo,
        fixture_id=fixture_id,
        events_payload=[],
        player_id_by_sportmonks={},
        team_id_by_sportmonks={},
    )

    assert report == EventSyncReport(upserted=0, deleted=0)
    assert len(await repo.list_by_fixture(fixture_id)) == 1


async def test_sync_is_idempotent(isolated_session: AsyncSession) -> None:
    session = isolated_session
    fixture_id = (await session.execute(select(FixtureORM.id).limit(1))).scalar_one()
    player_id = (await session.execute(select(PlayerORM.id).limit(1))).scalar_one()
    smk_player_id = 99_999_901
    repo = SqlAlchemyMatchEventRepository(session)

    feed = [_feed_event(301, 72, "yellowredcard", smk_player_id)]
    kwargs: dict[str, Any] = {
        "event_repo": repo,
        "fixture_id": fixture_id,
        "events_payload": feed,
        "player_id_by_sportmonks": {smk_player_id: player_id},
        "team_id_by_sportmonks": {},
    }
    first = await sync_fixture_events(**kwargs)
    second = await sync_fixture_events(**kwargs)

    assert (first.upserted, first.deleted) == (1, 0)
    assert (second.upserted, second.deleted) == (1, 0)
    remaining = await repo.list_by_fixture(fixture_id)
    assert [e.type for e in remaining] == [MatchEventType.YELLOW_RED_CARD]
