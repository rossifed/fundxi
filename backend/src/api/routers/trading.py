"""/api/trading — live-trading lock state for the UI.

``GET /locked`` returns the teams whose players are currently NON-tradeable
(match in play, or just before/after the whistle within a buffer), with a reason
code and the time trading re-opens. The frontend reads this once and refreshes it
periodically to disable + explain every trade entry point. Public: it is just
which teams are frozen, no per-user data. The authoritative block is the
``/api/trades`` guard; this endpoint only drives the UX.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_session
from src.application.trading_lock import locked_teams
from src.config import get_settings

router = APIRouter(prefix="/api/trading", tags=["trading"])


class TeamLockDTO(BaseModel):
    team_id: str
    reason: str
    reopens_at: datetime | None


@router.get("/locked", response_model=list[TeamLockDTO])
async def get_locked(session: AsyncSession = Depends(get_session)) -> list[TeamLockDTO]:
    locks = await locked_teams(session, now=datetime.now(UTC), settings=get_settings())
    return [TeamLockDTO(team_id=lk.team_id, reason=lk.reason, reopens_at=lk.reopens_at) for lk in locks]
