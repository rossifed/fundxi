"""/api/announcements — in-app messages for SIGNED-IN users.

GET returns the active announcements the caller has not yet dismissed; POST
``/{id}/ack`` records the dismissal ("Got it"), so each message is shown exactly
once per account (across devices). Both require auth (anonymous → 401): we only
surface announcements to signed-in users.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user_id, get_session
from src.infrastructure.db.repositories.announcement import SqlAlchemyAnnouncementRepository

router = APIRouter(prefix="/api/announcements", tags=["announcements"])


class AnnouncementDTO(BaseModel):
    id: int
    title: str
    body: str
    severity: str
    published_at: datetime


@router.get("", response_model=list[AnnouncementDTO])
async def list_announcements(
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> list[AnnouncementDTO]:
    items = await SqlAlchemyAnnouncementRepository(session).list_active_unacked(user_id)
    return [
        AnnouncementDTO(id=a.id, title=a.title, body=a.body, severity=a.severity, published_at=a.published_at)
        for a in items
    ]


@router.post("/{announcement_id}/ack")
async def ack_announcement(
    announcement_id: int,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    await SqlAlchemyAnnouncementRepository(session).ack(announcement_id=announcement_id, user_id=user_id)
    await session.commit()
    return {"status": "ok"}
