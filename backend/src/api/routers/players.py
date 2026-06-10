"""/api/players router."""

from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import (
    get_match_comment_repo,
    get_news_repo,
    get_player_repo,
    get_session,
    get_valuation_provider,
    resolve_session_user_id,
)
from src.api.dtos.match_comment import MatchCommentResponse
from src.api.dtos.news import NewsResponse
from src.api.dtos.player import PlayerResponse, PlayerStatsBrief, PlayerWithValuationResponse
from src.api.dtos.player_match import PlayerMatchEntryResponse
from src.api.dtos.player_screener import PlayerScreenerEntryResponse
from src.api.dtos.player_stat import PlayerTournamentStatResponse
from src.api.dtos.price_history import PriceHistoryResponse, PricePoint
from src.application.queries import (
    get_player,
    list_players,
    list_top_movers,
    search_players_with_valuation,
)
from src.application.screener_view import load_screener_view
from src.config import get_settings
from src.domain.player.player import Position
from src.domain.player.screener_criteria import ScreenerCriteria, SortDirection, SortKey, SortSpec
from src.domain.valuation.valuation_provider import ValuationProvider
from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM
from src.infrastructure.db.models.player_tournament_stat import PlayerTournamentStatORM
from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.news import SqlAlchemyNewsRepository
from src.infrastructure.db.repositories.player import SqlAlchemyPlayerRepository
from src.infrastructure.db.repositories.player_tournament_stat import (
    SqlAlchemyPlayerTournamentStatRepository,
)

router = APIRouter(prefix="/api/players", tags=["players"])


@router.get("", response_model=list[PlayerResponse])
async def players_list(repo: SqlAlchemyPlayerRepository = Depends(get_player_repo)) -> list[PlayerResponse]:
    players = await list_players(repo)
    return [PlayerResponse.from_domain(p) for p in players]


@router.get("/top-movers", response_model=list[PlayerWithValuationResponse])
async def players_top_movers(
    direction: str = Query(default="up"),
    limit: int = Query(default=5, ge=1, le=50),
    repo: SqlAlchemyPlayerRepository = Depends(get_player_repo),
    valuation_provider: ValuationProvider = Depends(get_valuation_provider),
) -> list[PlayerWithValuationResponse]:
    if direction not in {"up", "down"}:
        raise HTTPException(status_code=400, detail=f"direction must be 'up' or 'down', got {direction!r}")
    sort_dir = SortDirection.DESC if direction == "up" else SortDirection.ASC
    pairs = await list_top_movers(
        player_repo=repo, valuation_provider=valuation_provider, direction=sort_dir, limit=limit
    )
    return [PlayerWithValuationResponse.from_pair(p) for p in pairs]


@router.get("/search", response_model=list[PlayerWithValuationResponse])
async def players_search(
    positions: list[str] | None = Query(default=None),
    team_ids: list[str] | None = Query(default=None),
    min_value: float | None = Query(default=None),
    max_value: float | None = Query(default=None),
    search: str | None = Query(default=None),
    sort_key: str | None = Query(default=None),
    sort_dir: str | None = Query(default="desc"),
    limit: int = Query(default=500, ge=1, le=2000),
    repo: SqlAlchemyPlayerRepository = Depends(get_player_repo),
    valuation_provider: ValuationProvider = Depends(get_valuation_provider),
    session: AsyncSession = Depends(get_session),
) -> list[PlayerWithValuationResponse]:
    sort_spec = None
    if sort_key:
        try:
            key = SortKey(sort_key)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"invalid sort_key={sort_key!r}") from exc
        try:
            direction = SortDirection(sort_dir or "desc")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"invalid sort_dir={sort_dir!r}") from exc
        sort_spec = SortSpec(key=key, direction=direction)

    parsed_positions: tuple[Position, ...] | None = None
    if positions:
        try:
            parsed_positions = tuple(Position(p) for p in positions)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"invalid position in {positions!r}") from exc

    criteria = ScreenerCriteria(
        positions=parsed_positions,
        team_ids=tuple(team_ids) if team_ids else None,
        min_value=min_value,
        max_value=max_value,
        search=search,
        sort=sort_spec,
        limit=limit,
    )
    pairs = await search_players_with_valuation(
        player_repo=repo, valuation_provider=valuation_provider, criteria=criteria
    )

    # Attach each player's tournament-stat slice (one batch query) so a
    # squad / player card can show real stats, not just the valuation.
    player_ids = [p.player.id for p in pairs]
    stats_by_player: dict[int, PlayerStatsBrief] = {}
    if player_ids:
        season_id = get_settings().active_season_id
        stat_rows = await session.execute(
            select(PlayerTournamentStatORM).where(
                PlayerTournamentStatORM.player_id.in_(player_ids),
                PlayerTournamentStatORM.season_id == season_id,
            )
        )
        for orm in stat_rows.scalars():
            stats_by_player[orm.player_id] = PlayerStatsBrief(
                appearances=orm.appearances,
                minutes_played=orm.minutes_played,
                goals=orm.goals,
                assists=orm.assists,
                yellow_cards=orm.yellow_cards,
                red_cards=orm.red_cards,
                passes_accuracy=float(orm.passes_accuracy) if orm.passes_accuracy is not None else None,
                rating_avg=float(orm.rating_avg) if orm.rating_avg is not None else None,
            )
    return [PlayerWithValuationResponse.from_pair(p, stats_by_player.get(p.player.id)) for p in pairs]


@router.get("/screener-view", response_model=list[PlayerScreenerEntryResponse])
async def players_screener_view(
    request: Request,
    session: AsyncSession = Depends(get_session),
    valuation_provider: ValuationProvider = Depends(get_valuation_provider),
) -> list[PlayerScreenerEntryResponse]:
    """Single-shot batch payload feeding the Screener page.

    Everything is computed server-side — the frontend just renders and
    sorts/filters in memory on this dataset.

    Composed by load_screener_view:
      - core.player                 (identity, personal attrs) — SQL
      - core.player_tournament_stat (tournament aggregate) — SQL
      - app.holding                 (caller's position → pnl, average_buy_price) — SQL
      - valuation fields            (current_price, since_start/last/avg %, rating,
                                     source) — the shared ValuationProvider read-model,
                                     same source as top-movers / search.
    """
    from src.infrastructure.db.repositories.portfolio import SqlAlchemyPortfolioRepository

    settings = get_settings()
    season_id = settings.active_season_id

    # Holdings are private: scope them to the authenticated caller only.
    # An anonymous caller gets the screener with empty position columns
    # (held_shares 0, average_buy_price/pnl NULL) instead of another user's
    # portfolio. Same auth source as the rest of the app (session cookie).
    user_id = await resolve_session_user_id(request, session)
    portfolio_id: int | None = None
    if user_id is not None:
        portfolio = await SqlAlchemyPortfolioRepository(session).get_by_user_id(user_id)
        if portfolio is not None:
            portfolio_id = portfolio.id

    entries = await load_screener_view(
        session, valuation_provider=valuation_provider, season_id=season_id, portfolio_id=portfolio_id
    )
    return [PlayerScreenerEntryResponse(**asdict(e)) for e in entries]


@router.get("/{player_id}", response_model=PlayerResponse)
async def players_get(player_id: int, repo: SqlAlchemyPlayerRepository = Depends(get_player_repo)) -> PlayerResponse:
    player = await get_player(repo, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail=f"player {player_id} not found")
    return PlayerResponse.from_domain(player)


@router.get("/{player_id}/tournament-stats", response_model=PlayerTournamentStatResponse | None)
async def players_tournament_stats(
    player_id: int,
    season_id: int | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> PlayerTournamentStatResponse | None:
    """Aggregate stats for a player on the active (or specified) season.
    Returns null when no stats are recorded yet — callers render the section
    accordingly rather than treating absence as an error."""
    target_season = season_id if season_id is not None else get_settings().active_season_id
    repo = SqlAlchemyPlayerTournamentStatRepository(session)
    stat = await repo.get_for_player_season(player_id=player_id, season_id=target_season)
    if stat is None:
        return None
    return PlayerTournamentStatResponse.from_domain(stat)


@router.get("/{player_id}/comments", response_model=list[MatchCommentResponse])
async def players_comments(
    player_id: int,
    limit: int = Query(default=100, ge=1, le=500),
    comment_repo: SqlAlchemyMatchCommentRepository = Depends(get_match_comment_repo),
) -> list[MatchCommentResponse]:
    """All match commentaries that mention this player. Backed by
    core.match_comment_player_mention (populated by the enrichment worker)."""
    items = await comment_repo.list_by_player(player_id, limit=limit)
    return [MatchCommentResponse.from_domain(c) for c in items]


@router.get("/{player_id}/matches", response_model=list[PlayerMatchEntryResponse])
async def players_matches(
    player_id: int,
    session: AsyncSession = Depends(get_session),
) -> list[PlayerMatchEntryResponse]:
    """Per-match summary for a player: every fixture played in the past
    (lineup entry exists) PLUS upcoming/live fixtures for the player's
    registered team (no lineup yet). Past entries carry the player's stat
    line aggregated from core.match_event. Future entries carry status +
    kickoff so the UI can render an upcoming-match card.

    All data already lives in our DB — no Sportmonks call from this path."""
    rows = await session.execute(
        text(
            """
            WITH player_team AS (
              SELECT team_id FROM core.player WHERE id = :pid
            )
            SELECT
              f.id AS fixture_id,
              f.kickoff_at,
              f.home_team_id,
              f.away_team_id,
              f.home_score,
              f.away_score,
              f.status,
              COALESCE(l.team_id, (SELECT team_id FROM player_team)) AS player_team_id,
              COALESCE(l.role, '') AS role,
              COUNT(*) FILTER (
                WHERE e.player_id = :pid AND e.type IN ('goal', 'penalty')
              ) AS goals,
              COUNT(*) FILTER (
                WHERE e.related_player_id = :pid AND e.type IN ('goal', 'penalty')
              ) AS assists,
              COUNT(*) FILTER (
                WHERE e.player_id = :pid AND e.type = 'yellow_card'
              ) AS yellow_cards,
              COUNT(*) FILTER (
                WHERE e.player_id = :pid AND e.type IN ('red_card', 'yellow_red_card')
              ) AS red_cards,
              -- pre-match price = latest tick BEFORE the fixture's first tick
              -- (so the first event's price impact is captured by in_match_pct)
              (
                SELECT t1.current_price
                FROM valuation.player_price_tick t1
                WHERE t1.player_id = :pid
                  AND t1.ts < (
                    SELECT MIN(t2.ts)
                    FROM valuation.player_price_tick t2
                    WHERE t2.player_id = :pid AND t2.fixture_id = f.id
                  )
                ORDER BY t1.ts DESC
                LIMIT 1
              ) AS pre_match_price,
              -- post-match price = last tick of this fixture
              (
                SELECT t.current_price
                FROM valuation.player_price_tick t
                WHERE t.player_id = :pid AND t.fixture_id = f.id
                ORDER BY t.ts DESC
                LIMIT 1
              ) AS post_match_price
            FROM core.fixture f
            LEFT JOIN core.lineup l ON l.fixture_id = f.id AND l.player_id = :pid
            LEFT JOIN core.match_event e ON e.fixture_id = f.id
            WHERE
              l.id IS NOT NULL
              OR (
                f.status IN ('upcoming', 'live')
                AND (
                  f.home_team_id = (SELECT team_id FROM player_team)
                  OR f.away_team_id = (SELECT team_id FROM player_team)
                )
              )
            GROUP BY
              f.id, f.kickoff_at, f.home_team_id, f.away_team_id,
              f.home_score, f.away_score, f.status, l.team_id, l.role
            ORDER BY f.kickoff_at DESC NULLS LAST
            """
        ),
        {"pid": player_id},
    )
    out: list[PlayerMatchEntryResponse] = []
    for r in rows.mappings():
        pre = r["pre_match_price"]
        post = r["post_match_price"]
        in_match_pct = float((post - pre) / pre * 100) if pre and post and pre > 0 else None
        out.append(
            PlayerMatchEntryResponse(
                fixture_id=r["fixture_id"],
                kickoff_at=r["kickoff_at"],
                home_team_id=r["home_team_id"],
                away_team_id=r["away_team_id"],
                home_score=r["home_score"],
                away_score=r["away_score"],
                status=r["status"],
                player_team_id=r["player_team_id"],
                role=r["role"],
                goals=r["goals"],
                assists=r["assists"],
                yellow_cards=r["yellow_cards"],
                red_cards=r["red_cards"],
                in_match_pct=in_match_pct,
            )
        )
    return out


@router.get("/{player_id}/news", response_model=list[NewsResponse])
async def players_news(
    player_id: int,
    limit: int = Query(default=30, ge=1, le=200),
    repo: SqlAlchemyPlayerRepository = Depends(get_player_repo),
    news_repo: SqlAlchemyNewsRepository = Depends(get_news_repo),
) -> list[NewsResponse]:
    """News for the player's national/club team (any fixture the team plays
    in). Sportmonks news are tied to fixtures, not players directly — team
    is the closest proxy until we add a per-player text-mention enrichment.
    """
    player = await get_player(repo, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail=f"player {player_id} not found")
    items = await news_repo.list_by_team(player.team_id, limit=limit)
    return [NewsResponse.from_domain(n) for n in items]


@router.get("/{player_id}/price-history", response_model=PriceHistoryResponse)
async def players_price_history(
    player_id: int,
    session: AsyncSession = Depends(get_session),
) -> PriceHistoryResponse:
    """Full price-tick history for a player, chronological. Single chart
    spans tournament start → last tick — no period filtering in v0."""
    rows = (
        await session.execute(
            select(
                PlayerPriceTickORM.ts,
                PlayerPriceTickORM.current_price,
                PlayerPriceTickORM.fixture_id,
                PlayerPriceTickORM.change_since_open,
            )
            .where(PlayerPriceTickORM.player_id == player_id)
            .order_by(PlayerPriceTickORM.ts)
        )
    ).all()
    points = [
        PricePoint(
            ts=row.ts,
            price=float(row.current_price),
            fixture_id=row.fixture_id,
            change_since_open=float(row.change_since_open),
        )
        for row in rows
    ]
    return PriceHistoryResponse(player_id=player_id, points=points)
