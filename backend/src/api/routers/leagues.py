"""/api/leagues — list / create / join / detail.

All routes require auth (``get_current_user_id``). Presentation
concerns (icon, description, avatar) are deliberately NOT here — the
frontend adapter derives them. This router returns data only.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user_id, get_session
from src.application.league_service import (
    AlreadyMemberError,
    InvalidInviteError,
    InvalidLeagueNameError,
    LeagueDetail,
    LeagueNotFoundError,
    LeagueSummary,
    NotAMemberError,
    create_private_league,
    get_league_detail,
    join_league,
    list_user_leagues,
)

router = APIRouter(prefix="/api/leagues", tags=["leagues"])


class LeaderboardEntryResponse(BaseModel):
    rank: int
    user_id: int
    name: str
    value: float
    return_pct: float
    is_me: bool


class LeagueSummaryResponse(BaseModel):
    id: int
    name: str
    kind: str
    is_public: bool
    invite_code: str | None
    member_count: int
    my_rank: int
    my_return_pct: float

    @classmethod
    def of(cls, s: LeagueSummary) -> LeagueSummaryResponse:
        return cls(
            id=s.id,
            name=s.name,
            kind=s.kind,
            is_public=s.is_public,
            invite_code=s.invite_code,
            member_count=s.member_count,
            my_rank=s.my_rank,
            my_return_pct=s.my_return_pct,
        )


class LeagueDetailResponse(BaseModel):
    id: int
    name: str
    kind: str
    is_public: bool
    invite_code: str | None
    member_count: int
    leaderboard: list[LeaderboardEntryResponse]

    @classmethod
    def of(cls, d: LeagueDetail) -> LeagueDetailResponse:
        return cls(
            id=d.id,
            name=d.name,
            kind=d.kind,
            is_public=d.is_public,
            invite_code=d.invite_code,
            member_count=d.member_count,
            leaderboard=[
                LeaderboardEntryResponse(
                    rank=e.rank,
                    user_id=e.user_id,
                    name=e.name,
                    value=e.value,
                    return_pct=e.return_pct,
                    is_me=e.is_me,
                )
                for e in d.leaderboard
            ],
        )


class CreateLeagueBody(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class JoinLeagueBody(BaseModel):
    invite_code: str = Field(min_length=4, max_length=16)


@router.get("/mine", response_model=list[LeagueSummaryResponse])
async def my_leagues(
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> list[LeagueSummaryResponse]:
    summaries = await list_user_leagues(session, user_id=user_id)
    return [LeagueSummaryResponse.of(s) for s in summaries]


@router.post("", response_model=LeagueDetailResponse)
async def create_league(
    body: CreateLeagueBody,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> LeagueDetailResponse:
    try:
        detail = await create_private_league(session, user_id=user_id, name=body.name)
    except InvalidLeagueNameError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except InvalidInviteError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return LeagueDetailResponse.of(detail)


@router.post("/join", response_model=LeagueDetailResponse)
async def join(
    body: JoinLeagueBody,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> LeagueDetailResponse:
    try:
        detail = await join_league(session, user_id=user_id, invite_code=body.invite_code)
    except InvalidInviteError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LeagueNotFoundError as exc:
        raise HTTPException(status_code=404, detail="no league found for this invite code") from exc
    except AlreadyMemberError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return LeagueDetailResponse.of(detail)


@router.get("/{league_id}", response_model=LeagueDetailResponse)
async def league_detail(
    league_id: int,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> LeagueDetailResponse:
    try:
        detail = await get_league_detail(session, user_id=user_id, league_id=league_id)
    except LeagueNotFoundError as exc:
        raise HTTPException(status_code=404, detail="league not found") from exc
    except NotAMemberError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return LeagueDetailResponse.of(detail)
