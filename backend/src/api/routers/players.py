"""/api/players router."""

from datetime import UTC, datetime

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
from src.infrastructure.valuation.synthetic_valuation_provider import synthesize_valuation

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
) -> list[PlayerScreenerEntryResponse]:
    """Single-shot batch payload feeding the Screener page.

    Everything is computed server-side in one SQL — the frontend just renders
    and sorts/filters in memory on this dataset.

    Joined / computed:
      - core.player          (identity, personal attrs)
      - latest valuation tick (current_price, performance_rating)
      - baseline anchor tick  (since_start_pct = current vs base_value)
      - per-fixture deltas    (last_match_pct from the most recent fixture's ticks)
      - core.player_tournament_stat (tournament aggregate)
      - app.holding          (default user's position → pnl, average_buy_price)
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

    rows = await session.execute(
        text(
            """
            WITH latest_tick AS (
              SELECT DISTINCT ON (player_id)
                player_id, ts, current_price, performance_rating, change_since_open, source
              FROM valuation.player_price_tick
              ORDER BY player_id, ts DESC
            ),
            anchor AS (
              -- Pre-tournament baseline: the earliest fixture_id IS NULL
              -- tick (base_value, 0%). Falls back to the earliest tick
              -- overall for legacy data with no baseline. Same anchor
              -- EngineValuationProvider divides by, so screener and the
              -- valuation provider report an identical total.
              SELECT DISTINCT ON (player_id)
                player_id, current_price AS anchor_price
              FROM valuation.player_price_tick
              ORDER BY player_id, (fixture_id IS NOT NULL) ASC, ts ASC
            )
            SELECT
              p.id, p.name, p.full_name, p.jersey_number, p.team_id, p.position,
              p.detailed_position, p.age, p.foot, p.height, p.weight, p.club, p.image_path,
              lt.current_price, lt.performance_rating,
              lt.ts AS valuation_as_of, lt.source AS valuation_source,
              an.anchor_price,
              CASE
                WHEN an.anchor_price IS NOT NULL AND an.anchor_price > 0
                THEN ((lt.current_price - an.anchor_price) / an.anchor_price) * 100.0
                ELSE NULL
              END AS since_start_pct,
              lm.net_pct AS last_match_pct,
              ts.appearances, ts.minutes_played, ts.goals, ts.assists,
              ts.yellow_cards, ts.red_cards, ts.shots_total, ts.shots_on_target,
              ts.key_passes, ts.passes_total, ts.passes_accuracy, ts.rating_avg,
              COALESCE(h.shares, 0) AS held_shares,
              h.average_buy_price
            FROM core.player p
            LEFT JOIN latest_tick lt ON lt.player_id = p.id
            LEFT JOIN anchor an ON an.player_id = p.id
            LEFT JOIN core.player_tournament_stat ts
              ON ts.player_id = p.id AND ts.season_id = :season_id
            LEFT JOIN app.holding h
              ON h.player_id = p.id AND h.portfolio_id = :portfolio_id
            LEFT JOIN LATERAL (
              -- Net % of the player's MOST RECENT fixture: compound the
              -- per-event deltas (product of (1+d/100), minus 1), i.e.
              -- close-vs-open of that match -- NOT the last single
              -- event's delta (which made a whole team look red when the
              -- match's final event was a goal conceded, even in a win).
              SELECT (EXP(SUM(LN(1 + t.change_since_open / 100.0))) - 1) * 100.0 AS net_pct
              FROM valuation.player_price_tick t
              WHERE t.player_id = p.id
                AND t.fixture_id = (
                  SELECT fixture_id
                  FROM valuation.player_price_tick
                  WHERE player_id = p.id AND fixture_id IS NOT NULL
                  ORDER BY ts DESC
                  LIMIT 1
                )
            ) lm ON TRUE
            ORDER BY lt.current_price DESC NULLS LAST, p.id
            """
        ),
        {"season_id": season_id, "portfolio_id": portfolio_id},
    )

    # Players without any price tick (didn't play yet, or no pricing event)
    # still appear — with their deterministic synthetic base value. The
    # screener is keyed by core.player; live data only decorates it.
    now = datetime.now(UTC)

    out: list[PlayerScreenerEntryResponse] = []
    for r in rows.mappings():
        raw_price = r["current_price"]
        if raw_price is not None:
            current_price = float(raw_price)
            performance_rating = float(r["performance_rating"])
            valuation_as_of = r["valuation_as_of"]
            valuation_source = r["valuation_source"]
        else:
            synth = synthesize_valuation(r["id"], as_of=now)
            current_price = synth.base_value
            performance_rating = 6.5
            valuation_as_of = now
            valuation_source = "synthetic"

        shares = float(r["held_shares"] or 0)
        avg_buy = float(r["average_buy_price"]) if r["average_buy_price"] is not None else None
        pnl: float | None = None
        if shares != 0 and avg_buy is not None:
            pnl = shares * (current_price - avg_buy)
        since_start = r["since_start_pct"]
        apps = r["appearances"]
        avg_match: float | None = None
        if since_start is not None and apps and apps > 0:
            avg_match = float(since_start) / apps

        out.append(
            PlayerScreenerEntryResponse(
                id=r["id"],
                name=r["name"],
                full_name=r["full_name"],
                jersey_number=r["jersey_number"],
                team_id=r["team_id"],
                position=r["position"],
                detailed_position=r["detailed_position"],
                age=r["age"],
                foot=r["foot"],
                height=r["height"],
                weight=r["weight"],
                club=r["club"],
                image_path=r["image_path"],
                current_price=current_price,
                performance_rating=performance_rating,
                valuation_as_of=valuation_as_of,
                valuation_source=valuation_source,
                since_start_pct=float(since_start) if since_start is not None else None,
                last_match_pct=float(r["last_match_pct"]) if r["last_match_pct"] is not None else None,
                avg_match_pct=avg_match,
                appearances=r["appearances"],
                minutes_played=r["minutes_played"],
                goals=r["goals"],
                assists=r["assists"],
                yellow_cards=r["yellow_cards"],
                red_cards=r["red_cards"],
                shots_total=r["shots_total"],
                shots_on_target=r["shots_on_target"],
                key_passes=r["key_passes"],
                passes_total=r["passes_total"],
                passes_accuracy=float(r["passes_accuracy"]) if r["passes_accuracy"] is not None else None,
                rating_avg=float(r["rating_avg"]) if r["rating_avg"] is not None else None,
                held_shares=shares,
                average_buy_price=avg_buy,
                pnl=pnl,
            )
        )
    return out


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
