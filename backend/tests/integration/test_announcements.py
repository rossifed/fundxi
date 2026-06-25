"""Integration test for the announcements repo (DB-backed, rolled back).

A new announcement appears for a user until they ack it; ack is idempotent.
Skips when the local Postgres is unreachable (CI has no DB).
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.user import UserORM
from src.infrastructure.db.repositories.announcement import SqlAlchemyAnnouncementRepository

pytestmark = pytest.mark.anyio


async def test_list_excludes_acked_and_ack_is_idempotent(isolated_session: AsyncSession) -> None:
    session = isolated_session
    user = UserORM(name=f"_ann_{id(session)}", kind="human")
    session.add(user)
    await session.flush()

    repo = SqlAlchemyAnnouncementRepository(session)
    announcement_id = await repo.create(title="Heads up", body="Something changed.", severity="important")
    await session.flush()

    # Visible before ack.
    before = await repo.list_active_unacked(user.id)
    assert any(a.id == announcement_id for a in before)

    # Dismissed -> excluded for this user.
    await repo.ack(announcement_id=announcement_id, user_id=user.id)
    await session.flush()
    after = await repo.list_active_unacked(user.id)
    assert all(a.id != announcement_id for a in after)

    # Re-ack is a no-op (no error, no duplicate-key blow-up).
    await repo.ack(announcement_id=announcement_id, user_id=user.id)
    await session.flush()
