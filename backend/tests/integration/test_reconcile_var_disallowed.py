"""Integration test for reconcile_var_disallowed_goals (DB-backed, rolled back).

Regression for Portugal-Uzbekistan 2026-06-23: Uzbekistan's 29' goal by Aziz
Ganiev was disallowed by VAR, but Sportmonks stamped the VAR review at 30' and
removed the goal from its events feed, while the commentary transliterates the
scorer 'Aziz G'aniev'. The earlier exact-minute / raw-surname retraction matched
neither, so the phantom goal (structured event) and its goal comment survived.

The fix retracts the goal by FEED-ABSENCE (the player's stored goals not in the
current feed) and flips the comment via a minute window + punctuation-insensitive
surname match. This test exercises both over the real DB schema.

Skips when the local Postgres is unreachable (CI has no DB).
"""

import pytest
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.reconcile_var_disallowed_goals import reconcile_var_disallowed_goals
from src.domain.match.match_event import MatchEvent, MatchEventType
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.match_comment import MatchCommentORM
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.repositories.match_event import SqlAlchemyMatchEventRepository

pytestmark = pytest.mark.anyio


async def test_reconcile_retracts_offset_minute_and_punctuated_scorer(isolated_session: AsyncSession) -> None:
    session = isolated_session
    fixture_id = (await session.execute(select(FixtureORM.id).limit(1))).scalar_one()
    player_id = (await session.execute(select(PlayerORM.id).limit(1))).scalar_one()
    smk_player_id = 99_999_901  # synthetic Sportmonks id, mapped to the real player

    # Phantom structured goal at 29' (Sportmonks later removed it from the feed).
    events_repo = SqlAlchemyMatchEventRepository(session)
    await events_repo.upsert_by_sportmonks_id(
        MatchEvent(
            id=0,
            fixture_id=fixture_id,
            minute=29,
            extra_minute=None,
            type=MatchEventType.GOAL,
            player_id=player_id,
            related_player_id=None,
            team_id=None,
            info=None,
            sequence=3,
        ),
        sportmonks_id=88_888_801,
    )
    # Phantom goal comment at 29', scorer transliterated with an apostrophe.
    await session.execute(
        pg_insert(MatchCommentORM).values(
            sportmonks_id=88_888_802,
            fixture_id=fixture_id,
            minute=29,
            extra_minute=None,
            comment="Goal! Uzbekistan scores to make it 2-1 against Portugal. Aziz G'aniev finds the net.",
            is_goal=True,
            is_important=True,
            sequence=901,
        )
    )
    await session.flush()

    # VAR review at 30' (one minute after the goal), feed has NO goal for him.
    events_payload = [
        {
            "id": 157_196_964,
            "type": {"id": 10, "code": "VAR", "name": "VAR"},
            "minute": 30,
            "addition": "Goal disallowed",
            "player_id": smk_player_id,
            "player_name": "Aziz Ganiev",
        }
    ]

    retracted = await reconcile_var_disallowed_goals(
        session,
        fixture_id=fixture_id,
        events_payload=events_payload,
        player_id_by_sportmonks={smk_player_id: player_id},
    )

    # Both twins retracted: the structured goal event AND the goal comment.
    assert retracted >= 2
    surviving = [
        e
        for e in await events_repo.list_by_fixture(fixture_id)
        if e.type is MatchEventType.GOAL and e.player_id == player_id and e.minute == 29
    ]
    assert surviving == []
    comment_is_goal = (
        await session.execute(select(MatchCommentORM.is_goal).where(MatchCommentORM.sportmonks_id == 88_888_802))
    ).scalar_one()
    assert comment_is_goal is False
