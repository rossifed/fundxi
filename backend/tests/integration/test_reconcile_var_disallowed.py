"""Integration test for reconcile_var_disallowed_goals (DB-backed, rolled back).

Regression for Portugal-Uzbekistan 2026-06-23: Uzbekistan's 29' goal by Aziz
Ganiev was disallowed by VAR, but Sportmonks stamped the VAR review at 30' and
the commentary transliterates the scorer 'Aziz G'aniev'. An exact-minute /
raw-surname retraction matched neither, so the goal comment kept flagging a
phantom scorer.

The stale goal EVENT is pruned by the full-set sync (see
``test_sync_fixture_events``); this use case owns only the COMMENT retraction,
via a minute window + punctuation-insensitive surname match.

Skips when the local Postgres is unreachable (CI has no DB).
"""

import pytest
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.reconcile_var_disallowed_goals import reconcile_var_disallowed_goals
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.match_comment import MatchCommentORM

pytestmark = pytest.mark.anyio


async def test_reconcile_flips_goal_comment_with_offset_minute_and_punctuated_scorer(
    isolated_session: AsyncSession,
) -> None:
    session = isolated_session
    fixture_id = (await session.execute(select(FixtureORM.id).limit(1))).scalar_one()

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

    # VAR review at 30' (one minute after the goal).
    events_payload = [
        {
            "id": 157_196_964,
            "type": {"id": 10, "code": "VAR", "name": "VAR"},
            "minute": 30,
            "addition": "Goal disallowed",
            "player_id": 99_999_901,
            "player_name": "Aziz Ganiev",
        }
    ]

    retracted = await reconcile_var_disallowed_goals(
        session,
        fixture_id=fixture_id,
        events_payload=events_payload,
    )

    assert retracted >= 1
    comment_is_goal = (
        await session.execute(select(MatchCommentORM.is_goal).where(MatchCommentORM.sportmonks_id == 88_888_802))
    ).scalar_one()
    assert comment_is_goal is False
