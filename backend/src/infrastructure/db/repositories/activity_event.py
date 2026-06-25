"""SqlAlchemyActivityEventRepository — Adapter for the user-activity log."""

from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.activity_event import ActivityEventORM


class SqlAlchemyActivityEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record(self, *, kind: str, user_id: int | None, user_agent: str | None) -> None:
        """Append one activity event. ``user_id`` None = anonymous."""
        self._session.add(ActivityEventORM(kind=kind, user_id=user_id, user_agent=user_agent))
