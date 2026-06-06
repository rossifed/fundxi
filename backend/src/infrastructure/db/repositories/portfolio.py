"""SqlAlchemy adapters for PortfolioRepository + TradeRepository."""

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.portfolio.portfolio import Holding, Portfolio, Trade, TradeKind
from src.infrastructure.db.models.portfolio import HoldingORM, PortfolioORM, TradeORM


def _portfolio_to_domain(orm: PortfolioORM) -> Portfolio:
    return Portfolio(
        id=orm.id,
        user_id=orm.user_id,
        cash=float(orm.cash),
        created_at=orm.created_at,
        updated_at=orm.updated_at,
    )


def _holding_to_domain(orm: HoldingORM) -> Holding:
    return Holding(
        portfolio_id=orm.portfolio_id,
        player_id=orm.player_id,
        shares=float(orm.shares),
        average_buy_price=float(orm.average_buy_price),
    )


def _trade_to_domain(orm: TradeORM) -> Trade:
    return Trade(
        id=orm.id,
        portfolio_id=orm.portfolio_id,
        player_id=orm.player_id,
        kind=TradeKind(orm.kind),
        shares=float(orm.shares),
        price=float(orm.price),
        total=float(orm.total),
        executed_at=orm.executed_at,
    )


class SqlAlchemyPortfolioRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_user_id(self, user_id: int) -> Portfolio | None:
        result = await self._session.execute(select(PortfolioORM).where(PortfolioORM.user_id == user_id))
        row = result.scalar_one_or_none()
        return _portfolio_to_domain(row) if row else None

    async def get_by_user_id_for_update(self, user_id: int) -> Portfolio | None:
        """Same as ``get_by_user_id`` but takes a row-level ``FOR UPDATE``
        lock. The lock is held until the surrounding transaction commits,
        so concurrent trades on the same portfolio serialize instead of
        clobbering each other's cash/holdings (lost-update prevention)."""
        result = await self._session.execute(
            select(PortfolioORM).where(PortfolioORM.user_id == user_id).with_for_update()
        )
        row = result.scalar_one_or_none()
        return _portfolio_to_domain(row) if row else None

    async def create_for_user(self, *, user_id: int, cash: float) -> Portfolio:
        orm = PortfolioORM(user_id=user_id, cash=cash)
        self._session.add(orm)
        await self._session.flush()
        await self._session.refresh(orm)
        return _portfolio_to_domain(orm)

    async def update_cash(self, *, portfolio_id: int, new_cash: float) -> None:
        await self._session.execute(update(PortfolioORM).where(PortfolioORM.id == portfolio_id).values(cash=new_cash))

    async def list_holdings(self, portfolio_id: int) -> list[Holding]:
        result = await self._session.execute(
            select(HoldingORM).where(HoldingORM.portfolio_id == portfolio_id).order_by(HoldingORM.player_id)
        )
        return [_holding_to_domain(row) for row in result.scalars().all()]

    async def get_holding(self, *, portfolio_id: int, player_id: int) -> Holding | None:
        result = await self._session.execute(
            select(HoldingORM).where(HoldingORM.portfolio_id == portfolio_id, HoldingORM.player_id == player_id)
        )
        row = result.scalar_one_or_none()
        return _holding_to_domain(row) if row else None

    async def upsert_holding(self, holding: Holding) -> None:
        stmt = pg_insert(HoldingORM).values(
            portfolio_id=holding.portfolio_id,
            player_id=holding.player_id,
            shares=holding.shares,
            average_buy_price=holding.average_buy_price,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["portfolio_id", "player_id"],
            set_={
                "shares": stmt.excluded.shares,
                "average_buy_price": stmt.excluded.average_buy_price,
            },
        )
        await self._session.execute(stmt)

    async def delete_holding(self, *, portfolio_id: int, player_id: int) -> None:
        await self._session.execute(
            delete(HoldingORM).where(HoldingORM.portfolio_id == portfolio_id, HoldingORM.player_id == player_id)
        )


class SqlAlchemyTradeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def append(self, trade: Trade) -> Trade:
        orm = TradeORM(
            portfolio_id=trade.portfolio_id,
            player_id=trade.player_id,
            kind=trade.kind.value,
            shares=trade.shares,
            price=trade.price,
            total=trade.total,
        )
        self._session.add(orm)
        await self._session.flush()
        await self._session.refresh(orm)
        return _trade_to_domain(orm)

    async def list_by_portfolio(self, portfolio_id: int, *, limit: int = 200) -> list[Trade]:
        result = await self._session.execute(
            select(TradeORM)
            .where(TradeORM.portfolio_id == portfolio_id)
            .order_by(TradeORM.executed_at.desc())
            .limit(limit)
        )
        return [_trade_to_domain(row) for row in result.scalars().all()]
