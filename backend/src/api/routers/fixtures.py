"""/api/fixtures router."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import (
    get_fixture_repo,
    get_match_comment_repo,
    get_news_repo,
    get_session,
    get_valuation_provider,
)
from src.api.dtos.fixture import FixtureResponse
from src.api.dtos.match import MatchEventDTO, MatchPlayerResponse, MatchResponse
from src.api.dtos.match_comment import MatchCommentResponse
from src.api.dtos.news import NewsResponse
from src.application.get_match import MatchPlayerView, get_match_view
from src.application.queries import get_fixture, get_live_fixture, list_fixtures
from src.domain.match.match_event import MatchEvent, MatchEventType
from src.domain.valuation.valuation_provider import ValuationProvider
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.news import SqlAlchemyNewsRepository
from src.infrastructure.db.repositories.team_match_stat import SqlAlchemyTeamMatchStatRepository

router = APIRouter(prefix="/api/fixtures", tags=["fixtures"])

_TYPE_LABEL: dict[MatchEventType, str] = {
    MatchEventType.GOAL: "⚽",
    MatchEventType.PENALTY: "🎯",
    MatchEventType.PENALTY_MISSED: "❌",
    MatchEventType.OWN_GOAL: "⚽",
    MatchEventType.YELLOW_CARD: "🟨",
    MatchEventType.RED_CARD: "🟥",
    MatchEventType.YELLOW_RED_CARD: "🟥",
    MatchEventType.SUBSTITUTION: "🔄",
    MatchEventType.VAR: "📺",
    MatchEventType.INJURY: "🏥",
    MatchEventType.OTHER: "▫️",
}


def _player_view_to_dto(view: MatchPlayerView) -> MatchPlayerResponse:
    return MatchPlayerResponse(
        id=view.player.id,
        name=view.player.name,
        full_name=view.player.full_name,
        jersey_number=view.lineup.jersey_number,
        position=view.player.position.value,
        team_id=view.lineup.team_id,
        value=view.valuation.current_price,
        rating=view.valuation.performance_rating,
        change_last_match=view.valuation.change_last_match,
        formation_position=view.lineup.formation_position,
        formation_field=view.lineup.formation_field,
    )


def _event_dto(ev: MatchEvent, player_names: dict[int, str]) -> MatchEventDTO:
    player_name = player_names.get(ev.player_id) if ev.player_id else None
    related_name = player_names.get(ev.related_player_id) if ev.related_player_id else None
    headline: str | None = None
    if ev.type in (MatchEventType.GOAL, MatchEventType.PENALTY):
        if related_name and player_name:
            headline = f"Goal: {player_name} (assist {related_name})"
        elif player_name:
            headline = f"Goal: {player_name}"
    elif ev.type is MatchEventType.SUBSTITUTION and player_name and related_name:
        headline = f"{player_name} ⇄ {related_name}"
    elif player_name:
        headline = f"{ev.type.value.replace('_', ' ').title()}: {player_name}"
    return MatchEventDTO(
        minute=ev.minute,
        extra_minute=ev.extra_minute,
        type=_TYPE_LABEL.get(ev.type, "▫️"),
        player_id=ev.player_id,
        player_name=player_name,
        team_id=ev.team_id,
        headline=headline,
        info=ev.info,
    )


@router.get("", response_model=list[FixtureResponse])
async def fixtures_list(repo: SqlAlchemyFixtureRepository = Depends(get_fixture_repo)) -> list[FixtureResponse]:
    fixtures = await list_fixtures(repo)
    return [FixtureResponse.from_domain(f) for f in fixtures]


@router.get("/live", response_model=FixtureResponse | None)
async def fixtures_live(repo: SqlAlchemyFixtureRepository = Depends(get_fixture_repo)) -> FixtureResponse | None:
    live = await get_live_fixture(repo)
    return FixtureResponse.from_domain(live) if live else None


# Sub-paths must come BEFORE the catch-all /{fixture_id}, otherwise FastAPI
# routes /{fixture_id}/match to the bare-id handler and 404s.
@router.get("/{fixture_id}/match", response_model=MatchResponse)
async def fixtures_match(
    fixture_id: int,
    session: AsyncSession = Depends(get_session),
    valuation_provider: ValuationProvider = Depends(get_valuation_provider),
) -> MatchResponse:
    view = await get_match_view(session=session, valuation_provider=valuation_provider, fixture_id=fixture_id)
    if view is None:
        raise HTTPException(status_code=404, detail=f"fixture {fixture_id} not found")
    return MatchResponse(
        fixture_id=view.fixture.id,
        home_team_id=view.fixture.home_team_id,
        away_team_id=view.fixture.away_team_id,
        status=view.fixture.status.value,
        group=view.fixture.group,
        home_score=view.fixture.home_score,
        away_score=view.fixture.away_score,
        minute=view.fixture.minute,
        home_kit_color=view.fixture.home_kit_color,
        away_kit_color=view.fixture.away_kit_color,
        home_formation=view.fixture.home_formation,
        away_formation=view.fixture.away_formation,
        home_xi=[_player_view_to_dto(v) for v in view.home_xi],
        away_xi=[_player_view_to_dto(v) for v in view.away_xi],
        home_bench=[_player_view_to_dto(v) for v in view.home_bench],
        away_bench=[_player_view_to_dto(v) for v in view.away_bench],
        events=[_event_dto(ev, view.player_names) for ev in view.events],
        player_changes={str(pid): pct for pid, pct in view.player_changes.items()},
    )


@router.get("/{fixture_id}/comments", response_model=list[MatchCommentResponse])
async def fixtures_comments(
    fixture_id: int,
    comment_repo: SqlAlchemyMatchCommentRepository = Depends(get_match_comment_repo),
) -> list[MatchCommentResponse]:
    comments = await comment_repo.list_by_fixture(fixture_id)
    return [MatchCommentResponse.from_domain(c) for c in comments]


@router.get("/{fixture_id}/news", response_model=list[NewsResponse])
async def fixtures_news(
    fixture_id: int,
    news_repo: SqlAlchemyNewsRepository = Depends(get_news_repo),
) -> list[NewsResponse]:
    items = await news_repo.list_by_fixture(fixture_id)
    return [NewsResponse.from_domain(n) for n in items]


@router.get("/{fixture_id}/team-stats")
async def fixtures_team_stats(
    fixture_id: int,
    session: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, float]]:
    """Return per-team match stats as ``{ team_id: { type_code: value } }``.
    Empty dicts when no stats have been ingested yet."""
    repo = SqlAlchemyTeamMatchStatRepository(session)
    rows = await repo.list_for_fixture(fixture_id)
    by_team: dict[str, dict[str, float]] = {}
    for team_id, type_code, value in rows:
        if value is None:
            continue
        by_team.setdefault(team_id, {})[type_code] = float(value)
    return by_team


@router.get("/{fixture_id}", response_model=FixtureResponse)
async def fixtures_get(
    fixture_id: int, repo: SqlAlchemyFixtureRepository = Depends(get_fixture_repo)
) -> FixtureResponse:
    fixture = await get_fixture(repo, fixture_id)
    if fixture is None:
        raise HTTPException(status_code=404, detail=f"fixture {fixture_id} not found")
    return FixtureResponse.from_domain(fixture)
