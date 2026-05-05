"""/api/fixtures router."""

from fastapi import APIRouter, Depends, HTTPException

from src.api.dependencies import get_fixture_repo, get_match_comment_repo
from src.api.dtos.fixture import FixtureResponse
from src.api.dtos.match_comment import MatchCommentResponse
from src.application.queries import get_fixture, get_live_fixture, list_fixtures
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository

router = APIRouter(prefix="/api/fixtures", tags=["fixtures"])


@router.get("", response_model=list[FixtureResponse])
async def fixtures_list(repo: SqlAlchemyFixtureRepository = Depends(get_fixture_repo)) -> list[FixtureResponse]:
    fixtures = await list_fixtures(repo)
    return [FixtureResponse.from_domain(f) for f in fixtures]


@router.get("/live", response_model=FixtureResponse | None)
async def fixtures_live(repo: SqlAlchemyFixtureRepository = Depends(get_fixture_repo)) -> FixtureResponse | None:
    live = await get_live_fixture(repo)
    return FixtureResponse.from_domain(live) if live else None


@router.get("/{fixture_id}", response_model=FixtureResponse)
async def fixtures_get(
    fixture_id: int, repo: SqlAlchemyFixtureRepository = Depends(get_fixture_repo)
) -> FixtureResponse:
    fixture = await get_fixture(repo, fixture_id)
    if fixture is None:
        raise HTTPException(status_code=404, detail=f"fixture {fixture_id} not found")
    return FixtureResponse.from_domain(fixture)


@router.get("/{fixture_id}/comments", response_model=list[MatchCommentResponse])
async def fixtures_comments(
    fixture_id: int,
    comment_repo: SqlAlchemyMatchCommentRepository = Depends(get_match_comment_repo),
) -> list[MatchCommentResponse]:
    comments = await comment_repo.list_by_fixture(fixture_id)
    return [MatchCommentResponse.from_domain(c) for c in comments]
