"""SqlAlchemyAnnouncementRepository — Adapter for in-app announcements."""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.announcement import Announcement
from src.infrastructure.db.models.announcement import AnnouncementAckORM, AnnouncementORM


class SqlAlchemyAnnouncementRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_active_unacked(self, user_id: int) -> list[Announcement]:
        """Active announcements this user has NOT yet dismissed, newest first."""
        acked = select(AnnouncementAckORM.announcement_id).where(AnnouncementAckORM.user_id == user_id)
        rows = await self._session.execute(
            select(AnnouncementORM)
            .where(AnnouncementORM.active.is_(True))
            .where(AnnouncementORM.id.not_in(acked))
            .order_by(AnnouncementORM.published_at.desc())
        )
        return [
            Announcement(id=r.id, title=r.title, body=r.body, severity=r.severity, published_at=r.published_at)
            for r in rows.scalars().all()
        ]

    async def ack(self, *, announcement_id: int, user_id: int) -> None:
        """Mark an announcement dismissed by a user. Idempotent (re-ack is a no-op)."""
        stmt = (
            pg_insert(AnnouncementAckORM)
            .values(announcement_id=announcement_id, user_id=user_id)
            .on_conflict_do_nothing(index_elements=["announcement_id", "user_id"])
        )
        await self._session.execute(stmt)

    async def create(self, *, title: str, body: str, severity: str = "info") -> int:
        """Insert a new announcement; returns its id. Used by the admin posting script."""
        row = AnnouncementORM(title=title, body=body, severity=severity)
        self._session.add(row)
        await self._session.flush()
        return row.id
