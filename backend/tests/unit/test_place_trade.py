"""Unit tests for the place_trade Use Case — no DB.

Covers the policy place_trade owns on top of execute_trade:
- server-side pricing with a synthetic base-value FALLBACK when a player has no
  tick yet (a starting price IS its base_value — it must stay tradeable, not
  409);
- the margin gate (a short beyond equity is rejected before execution).

The execution math itself is covered by test_trade_execution; here we assert
place_trade's resolve -> price -> check -> delegate flow.
"""

import asyncio
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime

import pytest

from src.application.place_trade import InsufficientMarginError, PlaceTradeCommand, place_trade
from src.domain.portfolio.portfolio import Holding, Portfolio, Trade
from src.domain.portfolio.user import User, UserKind
from src.infrastructure.valuation.synthetic_valuation_provider import synthesize_valuation

_NOW = datetime.now(UTC)


@dataclass(slots=True)
class _FakeUserRepo:
    user: User | None

    async def get_by_id(self, user_id: int) -> User | None:
        return self.user if self.user and self.user.id == user_id else None

    async def get_default_human(self) -> User | None:  # pragma: no cover
        return self.user

    async def list_bots(self) -> list[User]:  # pragma: no cover
        return []

    async def create(self, *, name: str, kind: UserKind, strategy: str | None = None) -> User:  # pragma: no cover
        raise NotImplementedError


@dataclass(slots=True)
class _FakePortfolioRepo:
    portfolio: Portfolio
    holdings: dict[int, Holding] = field(default_factory=dict)

    async def get_by_user_id(self, user_id: int) -> Portfolio | None:  # pragma: no cover
        return self.portfolio if self.portfolio.user_id == user_id else None

    async def get_by_user_id_for_update(self, user_id: int) -> Portfolio | None:
        return self.portfolio if self.portfolio.user_id == user_id else None

    async def create_for_user(self, *, user_id: int, cash: float) -> Portfolio:  # pragma: no cover
        raise NotImplementedError

    async def update_cash(self, *, portfolio_id: int, new_cash: float) -> None:
        self.portfolio = replace(self.portfolio, cash=new_cash)

    async def list_holdings(self, portfolio_id: int) -> list[Holding]:
        return [h for h in self.holdings.values() if h.portfolio_id == portfolio_id]

    async def get_holding(self, *, portfolio_id: int, player_id: int) -> Holding | None:
        return self.holdings.get(player_id)

    async def upsert_holding(self, holding: Holding) -> None:
        self.holdings[holding.player_id] = holding

    async def delete_holding(self, *, portfolio_id: int, player_id: int) -> None:
        self.holdings.pop(player_id, None)


@dataclass(slots=True)
class _FakeTradeRepo:
    trades: list[Trade] = field(default_factory=list)

    async def append(self, trade: Trade) -> Trade:
        recorded = replace(trade, id=len(self.trades) + 1)
        self.trades.append(recorded)
        return recorded

    async def list_by_portfolio(self, portfolio_id: int, *, limit: int = 200) -> list[Trade]:  # pragma: no cover
        return list(self.trades)


@dataclass(slots=True)
class _FakePriceProvider:
    prices: dict[int, float]

    async def get_many(self, player_ids):  # type: ignore[no-untyped-def]
        return {pid: self.prices[pid] for pid in player_ids if pid in self.prices}


def _setup(*, cash: float, prices: dict[int, float], holdings: list[Holding] | None = None):
    user = User(id=1, name="t", kind=UserKind.HUMAN, strategy=None, created_at=_NOW)
    portfolio = Portfolio(id=1, user_id=1, cash=cash, created_at=_NOW, updated_at=_NOW)
    repo = _FakePortfolioRepo(portfolio=portfolio, holdings={h.player_id: h for h in (holdings or [])})
    return _FakeUserRepo(user), repo, _FakeTradeRepo(), _FakePriceProvider(prices)


def _run(coro):  # type: ignore[no-untyped-def]
    return asyncio.new_event_loop().run_until_complete(coro)


def test_unticked_player_is_traded_at_its_synthetic_base_value() -> None:
    # Player 7 has no tick (price provider empty). It must still be tradeable at
    # its base_value — the same price the Screener shows — not 409.
    user_repo, portfolio_repo, trade_repo, price_provider = _setup(cash=1000.0, prices={})
    expected_price = synthesize_valuation(7, as_of=_NOW).base_value

    out = _run(
        place_trade(
            command=PlaceTradeCommand(user_id=1, player_id=7, kind="buy", shares=1.0),
            user_repo=user_repo,
            portfolio_repo=portfolio_repo,
            trade_repo=trade_repo,
            price_provider=price_provider,
            max_leverage=1.0,
        )
    )
    assert out.trade.price == expected_price
    assert out.trade.total == round(expected_price, 2)


def test_buy_uses_the_server_tick_when_present() -> None:
    user_repo, portfolio_repo, trade_repo, price_provider = _setup(cash=1000.0, prices={7: 12.0})
    out = _run(
        place_trade(
            command=PlaceTradeCommand(user_id=1, player_id=7, kind="buy", shares=2.0),
            user_repo=user_repo,
            portfolio_repo=portfolio_repo,
            trade_repo=trade_repo,
            price_provider=price_provider,
            max_leverage=1.0,
        )
    )
    assert out.trade.price == 12.0
    assert out.portfolio.cash == 1000.0 - 24.0


def test_short_beyond_equity_is_rejected_by_margin() -> None:
    # Flat €100M portfolio, no leverage: shorting 20 @ €10M = €200M gross > €100M.
    user_repo, portfolio_repo, trade_repo, price_provider = _setup(cash=100.0, prices={7: 10.0})
    with pytest.raises(InsufficientMarginError):
        _run(
            place_trade(
                command=PlaceTradeCommand(user_id=1, player_id=7, kind="sell", shares=20.0),
                user_repo=user_repo,
                portfolio_repo=portfolio_repo,
                trade_repo=trade_repo,
                price_provider=price_provider,
                max_leverage=1.0,
            )
        )
    # Nothing was written: no trade appended, no short opened.
    assert trade_repo.trades == []
    assert portfolio_repo.holdings == {}


def test_short_within_equity_is_allowed() -> None:
    user_repo, portfolio_repo, trade_repo, price_provider = _setup(cash=100.0, prices={7: 10.0})
    out = _run(
        place_trade(
            command=PlaceTradeCommand(user_id=1, player_id=7, kind="sell", shares=5.0),
            user_repo=user_repo,
            portfolio_repo=portfolio_repo,
            trade_repo=trade_repo,
            price_provider=price_provider,
            max_leverage=1.0,
        )
    )
    # 5 short @ 10 = 50 gross <= 100 equity. Cash credited, short position open.
    assert out.portfolio.cash == 150.0
    assert out.holding is not None
    assert out.holding.shares == -5.0
