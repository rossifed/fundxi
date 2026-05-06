"""/api/players router."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import (
    get_match_comment_repo,
    get_player_repo,
    get_session,
    get_valuation_provider,
)
from src.api.dtos.match_comment import MatchCommentResponse
from src.api.dtos.player import PlayerResponse, PlayerWithValuationResponse
from src.api.dtos.price_history import PriceHistoryResponse, PricePoint
from src.application.queries import (
    get_player,
    list_players,
    list_top_movers,
    search_players_with_valuation,
)
from src.domain.player.player import Position
from src.domain.player.screener_criteria import ScreenerCriteria, SortDirection, SortKey, SortSpec
from src.domain.valuation.valuation_provider import ValuationProvider
from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM
from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.player import SqlAlchemyPlayerRepository

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
    return [PlayerWithValuationResponse.from_pair(p) for p in pairs]


@router.get("/{player_id}", response_model=PlayerResponse)
async def players_get(player_id: int, repo: SqlAlchemyPlayerRepository = Depends(get_player_repo)) -> PlayerResponse:
    player = await get_player(repo, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail=f"player {player_id} not found")
    return PlayerResponse.from_domain(player)


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
