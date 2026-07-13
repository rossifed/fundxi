"""/api/fixtures router."""

from dataclasses import replace

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
from src.api.dtos.match_player_stat import FixturePlayerStatResponse
from src.api.dtos.news import NewsResponse
from src.application.discipline import DISCIPLINE_ZERO, fixture_discipline
from src.application.get_match import MatchPlayerView, get_match_view
from src.application.queries import get_fixture, get_live_fixture, list_fixtures
from src.config import get_settings
from src.domain.match.match_event import MatchEvent, MatchEventType
from src.domain.valuation.valuation_provider import ValuationProvider
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.news import SqlAlchemyNewsRepository
from src.infrastructure.db.repositories.player_match_stat import SqlAlchemyPlayerMatchStatRepository
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
    # ``lineup`` is None for a squad-fallback view (no XI published yet) — jersey,
    # team and formation then come from the player (no pitch placement).
    ln = view.lineup
    return MatchPlayerResponse(
        id=view.player.id,
        name=view.player.name,
        full_name=view.player.full_name,
        jersey_number=ln.jersey_number if ln else view.player.jersey_number,
        position=view.player.position.value,
        team_id=ln.team_id if ln else view.player.team_id,
        value=view.valuation.current_price,
        rating=view.valuation.performance_rating,
        change_last_match=view.valuation.change_last_match,
        change_this_match=view.change_this_match,
        formation_position=ln.formation_position if ln else None,
        formation_field=ln.formation_field if ln else None,
    )


def _event_dto(ev: MatchEvent, player_names: dict[int, str]) -> MatchEventDTO:
    player_name = player_names.get(ev.player_id) if ev.player_id else None
    related_name = player_names.get(ev.related_player_id) if ev.related_player_id else None
    headline: str | None = None
    if ev.type is MatchEventType.OWN_GOAL:
        if player_name:
            headline = f"Own goal: {player_name}"
    elif ev.type in (MatchEventType.GOAL, MatchEventType.PENALTY):
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
        related_player_id=ev.related_player_id,
        related_player_name=related_name,
        team_id=ev.team_id,
        headline=headline,
        info=ev.info,
        is_own_goal=ev.type is MatchEventType.OWN_GOAL,
    )


@router.get("", response_model=list[FixtureResponse])
async def fixtures_list(repo: SqlAlchemyFixtureRepository = Depends(get_fixture_repo)) -> list[FixtureResponse]:
    # Scope to the active tournament so the GUI never mixes WC2022 +
    # WC2026 (both coexist in core.fixture). active_season_id <= 0 means
    # "unset" → no filter (return everything, dev fallback).
    season = get_settings().active_season_id
    fixtures = await list_fixtures(repo, season_id=season if season > 0 else None)
    return [FixtureResponse.from_domain(f) for f in fixtures]


@router.get("/live", response_model=FixtureResponse | None)
async def fixtures_live(repo: SqlAlchemyFixtureRepository = Depends(get_fixture_repo)) -> FixtureResponse | None:
    season = get_settings().active_season_id
    live = await get_live_fixture(repo, season_id=season if season > 0 else None)
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
        home_pen_score=view.fixture.home_pen_score,
        away_pen_score=view.fixture.away_pen_score,
        minute=view.fixture.minute,
        home_kit_color=view.fixture.home_kit_color,
        away_kit_color=view.fixture.away_kit_color,
        home_formation=view.fixture.home_formation,
        away_formation=view.fixture.away_formation,
        lineup_published=view.lineup_published,
        home_xi=[_player_view_to_dto(v) for v in view.home_xi],
        away_xi=[_player_view_to_dto(v) for v in view.away_xi],
        home_bench=[_player_view_to_dto(v) for v in view.home_bench],
        away_bench=[_player_view_to_dto(v) for v in view.away_bench],
        home_squad=[_player_view_to_dto(v) for v in view.home_squad],
        away_squad=[_player_view_to_dto(v) for v in view.away_squad],
        events=[_event_dto(ev, view.player_names) for ev in view.events],
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


@router.get("/{fixture_id}/player-stats", response_model=list[FixturePlayerStatResponse])
async def fixtures_player_stats(
    fixture_id: int,
    session: AsyncSession = Depends(get_session),
) -> list[FixturePlayerStatResponse]:
    """Per-player live match stats (rating, xG, shots, key passes, pass%, …)
    from ``core.player_match_stat`` — the Sportmonks ``lineups.details``
    projection written by the live ingest. Empty list until stats have been
    ingested for this fixture (pre-kickoff, or a fixture never polled live).

    Cards are OVERRIDDEN with the event-derived counts (live, equal to the
    displayed timeline by construction) — see src/application/discipline.py."""
    repo = SqlAlchemyPlayerMatchStatRepository(session)
    stats = await repo.list_by_fixture(fixture_id)
    cards = await fixture_discipline(session, fixture_id=fixture_id)
    stats = [
        replace(
            s,
            yellow_cards=cards.get(s.player_id, DISCIPLINE_ZERO).yellow_cards,
            red_cards=cards.get(s.player_id, DISCIPLINE_ZERO).red_cards,
        )
        for s in stats
    ]
    return [FixturePlayerStatResponse.from_domain(s) for s in stats]


@router.get("/{fixture_id}", response_model=FixtureResponse)
async def fixtures_get(
    fixture_id: int, repo: SqlAlchemyFixtureRepository = Depends(get_fixture_repo)
) -> FixtureResponse:
    fixture = await get_fixture(repo, fixture_id)
    if fixture is None:
        raise HTTPException(status_code=404, detail=f"fixture {fixture_id} not found")
    return FixtureResponse.from_domain(fixture)
