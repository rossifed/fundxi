"""/api/me, /api/portfolio, /api/trades router (mono-user v0)."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user_id, get_session
from src.api.dtos.portfolio import (
    HoldingResponse,
    PortfolioResponse,
    TradeOutcomeResponse,
    TradeRequestBody,
    TradeResponse,
    UserResponse,
)
from src.api.dtos.portfolio_history import PortfolioHistoryPoint, PortfolioHistoryResponse
from src.application.place_trade import (
    InsufficientMarginError,
    InvalidTradeKindError,
    NoServerPriceError,
    PlaceTradeCommand,
    PlayerOwnershipCapError,
    PortfolioNotFoundError,
    ShortingDisabledError,
    UserNotFoundError,
    place_trade,
)
from src.application.portfolio_history_service import HistoryRange, PortfolioHistoryService
from src.application.provision_portfolio import get_or_create_portfolio
from src.application.trade_execution import TradeError
from src.config import get_settings
from src.domain.portfolio.portfolio import Portfolio
from src.infrastructure.db.repositories.portfolio import (
    SqlAlchemyPortfolioRepository,
    SqlAlchemyTradeRepository,
)
from src.infrastructure.db.repositories.portfolio_snapshot import (
    SqlAlchemyPortfolioSnapshotRepository,
)
from src.infrastructure.db.repositories.portfolio_snapshot_adapters import (
    SqlAlchemyCurrentPriceProvider,
    SqlAlchemyLatestPriceProvider,
    SqlAlchemyPortfolioReader,
)
from src.infrastructure.db.repositories.user import SqlAlchemyUserRepository
from src.infrastructure.valuation.db_or_synthetic_starting_price_provider import (
    DbOrSyntheticStartingPriceProvider,
)

router = APIRouter(tags=["app"])


async def _resolve_user_and_portfolio(
    session: AsyncSession, user_id: int
) -> tuple[int, str, Portfolio]:
    user_repo = SqlAlchemyUserRepository(session)
    user = await user_repo.get_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="user not found")
    # "1 user = 1 portfolio": self-heal legacy users that predate auto-provisioning
    # instead of 503-ing (a missing portfolio is not a service outage).
    portfolio = await get_or_create_portfolio(session, user.id)
    return user.id, user.name, portfolio


def _portfolio_dto(portfolio: Portfolio, holdings: list[HoldingResponse]) -> PortfolioResponse:
    return PortfolioResponse(
        id=portfolio.id,
        user_id=portfolio.user_id,
        cash=portfolio.cash,
        holdings=holdings,
    )


@router.get("/api/me", response_model=UserResponse)
async def me(
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    user_repo = SqlAlchemyUserRepository(session)
    user = await user_repo.get_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="user not found")
    return UserResponse(id=user.id, name=user.name, kind=user.kind.value)


@router.get("/api/portfolio", response_model=PortfolioResponse)
async def get_portfolio(
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> PortfolioResponse:
    _, _, portfolio = await _resolve_user_and_portfolio(session, user_id)
    portfolio_repo = SqlAlchemyPortfolioRepository(session)
    holdings = await portfolio_repo.list_holdings(portfolio.id)
    return _portfolio_dto(
        portfolio,
        [
            HoldingResponse(player_id=h.player_id, shares=h.shares, average_buy_price=h.average_buy_price)
            for h in holdings
        ],
    )


@router.post("/api/trades", response_model=TradeOutcomeResponse)
async def post_trade(
    body: TradeRequestBody,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> TradeOutcomeResponse:
    portfolio_repo = SqlAlchemyPortfolioRepository(session)
    try:
        outcome = await place_trade(
            command=PlaceTradeCommand(
                user_id=user_id,
                player_id=body.player_id,
                kind=body.kind,
                shares=body.shares,
                idempotency_key=idempotency_key,
            ),
            user_repo=SqlAlchemyUserRepository(session),
            portfolio_repo=portfolio_repo,
            trade_repo=SqlAlchemyTradeRepository(session),
            price_provider=SqlAlchemyLatestPriceProvider(session),
            starting_price_provider=DbOrSyntheticStartingPriceProvider(session, as_of=datetime.now(UTC)),
            max_leverage=get_settings().max_gross_leverage,
        )
    except UserNotFoundError as exc:
        raise HTTPException(status_code=401, detail="user not found") from exc
    except PortfolioNotFoundError as exc:
        raise HTTPException(status_code=503, detail=f"no portfolio for user {user_id}") from exc
    except InvalidTradeKindError as exc:
        raise HTTPException(status_code=400, detail=f"invalid kind={body.kind!r}") from exc
    except NoServerPriceError as exc:
        raise HTTPException(
            status_code=409, detail=f"no current price for player {body.player_id}; cannot execute trade"
        ) from exc
    except InsufficientMarginError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PlayerOwnershipCapError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ShortingDisabledError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TradeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await session.commit()

    holdings = await portfolio_repo.list_holdings(outcome.portfolio.id)
    return TradeOutcomeResponse(
        trade=TradeResponse(
            id=outcome.trade.id,
            portfolio_id=outcome.trade.portfolio_id,
            player_id=outcome.trade.player_id,
            kind=outcome.trade.kind.value,
            shares=outcome.trade.shares,
            price=outcome.trade.price,
            total=outcome.trade.total,
            executed_at=outcome.trade.executed_at,
        ),
        portfolio=_portfolio_dto(
            outcome.portfolio,
            [
                HoldingResponse(player_id=h.player_id, shares=h.shares, average_buy_price=h.average_buy_price)
                for h in holdings
            ],
        ),
    )


@router.get("/api/portfolio/history", response_model=PortfolioHistoryResponse)
async def get_portfolio_history(
    range: str = "24h",
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> PortfolioHistoryResponse:
    _, _, portfolio = await _resolve_user_and_portfolio(session, user_id)
    try:
        range_ = HistoryRange(range)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"invalid range={range!r}") from exc

    service = PortfolioHistoryService(
        portfolio_repo=SqlAlchemyPortfolioRepository(session),
        snapshot_repo=SqlAlchemyPortfolioSnapshotRepository(session),
        # tick ?? base — the live tail marks holdings at the same price the
        # frontend totals use, so the chart's rightmost point matches the KPI.
        price_provider=SqlAlchemyCurrentPriceProvider(session, as_of=datetime.now(UTC)),
        portfolio_reader=SqlAlchemyPortfolioReader(session),
    )
    snapshots = await service.read(portfolio_id=portfolio.id, range_=range_)
    return PortfolioHistoryResponse(
        portfolio_id=portfolio.id,
        range=range_.value,
        points=[
            PortfolioHistoryPoint(
                ts=s.ts,
                cash=s.cash,
                holdings_value=s.holdings_value,
                value=s.value,
                pnl_vs_open=s.pnl_vs_open,
            )
            for s in snapshots
        ],
    )


@router.get("/api/trades", response_model=list[TradeResponse])
async def list_trades(
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> list[TradeResponse]:
    _, _, portfolio = await _resolve_user_and_portfolio(session, user_id)
    trade_repo = SqlAlchemyTradeRepository(session)
    trades = await trade_repo.list_by_portfolio(portfolio.id)
    return [
        TradeResponse(
            id=t.id,
            portfolio_id=t.portfolio_id,
            player_id=t.player_id,
            kind=t.kind.value,
            shares=t.shares,
            price=t.price,
            total=t.total,
            executed_at=t.executed_at,
        )
        for t in trades
    ]
