"""/api/teams router."""

from fastapi import APIRouter, Depends, HTTPException, Query

from src.api.dependencies import (
    get_match_comment_repo,
    get_news_repo,
    get_standing_repo,
    get_team_repo,
)
from src.api.dtos.match_comment import MatchCommentResponse
from src.api.dtos.news import NewsResponse
from src.api.dtos.standings import StandingRowResponse
from src.api.dtos.team import TeamResponse
from src.application.queries import get_team, list_teams
from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.news import SqlAlchemyNewsRepository
from src.infrastructure.db.repositories.standings import SqlAlchemyStandingRepository
from src.infrastructure.db.repositories.team import SqlAlchemyTeamRepository

router = APIRouter(prefix="/api/teams", tags=["teams"])


@router.get("", response_model=list[TeamResponse])
async def teams_list(repo: SqlAlchemyTeamRepository = Depends(get_team_repo)) -> list[TeamResponse]:
    teams = await list_teams(repo)
    return [TeamResponse.from_domain(t) for t in teams]


@router.get("/{team_id}", response_model=TeamResponse)
async def teams_get(team_id: str, repo: SqlAlchemyTeamRepository = Depends(get_team_repo)) -> TeamResponse:
    team = await get_team(repo, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail=f"team {team_id} not found")
    return TeamResponse.from_domain(team)


@router.get("/{team_id}/news", response_model=list[NewsResponse])
async def teams_news(
    team_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    news_repo: SqlAlchemyNewsRepository = Depends(get_news_repo),
) -> list[NewsResponse]:
    items = await news_repo.list_by_team(team_id, limit=limit)
    return [NewsResponse.from_domain(n) for n in items]


@router.get("/{team_id}/comments", response_model=list[MatchCommentResponse])
async def teams_comments(
    team_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    comment_repo: SqlAlchemyMatchCommentRepository = Depends(get_match_comment_repo),
) -> list[MatchCommentResponse]:
    items = await comment_repo.list_by_team(team_id, limit=limit)
    return [MatchCommentResponse.from_domain(c) for c in items]


@router.get("/{team_id}/standing", response_model=StandingRowResponse | None)
async def teams_standing(
    team_id: str,
    standing_repo: SqlAlchemyStandingRepository = Depends(get_standing_repo),
    team_repo: SqlAlchemyTeamRepository = Depends(get_team_repo),
) -> StandingRowResponse | None:
    standing = await standing_repo.get_for_team(team_id)
    if standing is None:
        return None
    team = await get_team(team_repo, team_id)
    return StandingRowResponse.from_domain(standing, team)
