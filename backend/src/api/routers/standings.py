"""/api/standings router — group-stage tables."""

from fastapi import APIRouter, Depends, HTTPException

from src.api.dependencies import get_standing_repo, get_team_repo
from src.api.dtos.standings import GroupStandingResponse, StandingRowResponse
from src.application.queries import list_teams
from src.infrastructure.db.repositories.standings import SqlAlchemyStandingRepository
from src.infrastructure.db.repositories.team import SqlAlchemyTeamRepository

router = APIRouter(prefix="/api/standings", tags=["standings"])


@router.get("", response_model=list[GroupStandingResponse])
async def standings_all(
    standing_repo: SqlAlchemyStandingRepository = Depends(get_standing_repo),
    team_repo: SqlAlchemyTeamRepository = Depends(get_team_repo),
) -> list[GroupStandingResponse]:
    standings = await standing_repo.list_all()
    teams_by_id = {t.id: t for t in await list_teams(team_repo)}
    by_group: dict[str, list[StandingRowResponse]] = {}
    for standing in standings:
        row = StandingRowResponse.from_domain(standing, teams_by_id.get(standing.team_id))
        by_group.setdefault(standing.group, []).append(row)
    return [
        GroupStandingResponse(group=group, rows=sorted(rows, key=lambda r: r.position))
        for group, rows in sorted(by_group.items())
    ]


@router.get("/{group}", response_model=GroupStandingResponse)
async def standings_group(
    group: str,
    standing_repo: SqlAlchemyStandingRepository = Depends(get_standing_repo),
    team_repo: SqlAlchemyTeamRepository = Depends(get_team_repo),
) -> GroupStandingResponse:
    rows_domain = await standing_repo.list_by_group(group.upper())
    if not rows_domain:
        raise HTTPException(status_code=404, detail=f"no standings for group {group!r}")
    teams_by_id = {t.id: t for t in await list_teams(team_repo)}
    rows = [StandingRowResponse.from_domain(s, teams_by_id.get(s.team_id)) for s in rows_domain]
    return GroupStandingResponse(group=group.upper(), rows=sorted(rows, key=lambda r: r.position))
