"""Integration test for the activity-log repo (DB-backed, rolled back).

Verifies an anonymous ``open`` (user_id NULL) and a signed-in ``login`` both
persist. Skips when the local Postgres is unreachable (CI has no DB).
"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.activity_event import ActivityEventORM
from src.infrastructure.db.models.user import UserORM
from src.infrastructure.db.repositories.activity_event import SqlAlchemyActivityEventRepository

pytestmark = pytest.mark.anyio


async def test_records_anonymous_open_and_user_login(isolated_session: AsyncSession) -> None:
    session = isolated_session
    user = UserORM(name=f"_act_{id(session)}", kind="human")
    session.add(user)
    await session.flush()

    repo = SqlAlchemyActivityEventRepository(session)
    await repo.record(kind="open", user_id=None, user_agent="UA-anon")
    await repo.record(kind="login", user_id=user.id, user_agent="UA-user")
    await session.flush()

    rows = (
        (
            await session.execute(
                select(ActivityEventORM).where(ActivityEventORM.user_agent.in_(("UA-anon", "UA-user")))
            )
        )
        .scalars()
        .all()
    )
    by_kind = {r.kind: r for r in rows}
    assert by_kind["open"].user_id is None
    assert by_kind["login"].user_id == user.id
