"""Tests for the BACKEND trade execution — the actual source of truth.

Two layers, both fully unit-testable without a DB:

1. ``_compute_new_avg`` — pure function, 6 branches (open/extend a long,
   cover a short partially, cross from short to long; open/extend a
   short, reduce a long, cross from long to short). All branches have
   literal expected values derived from the weighted-average formula
   by hand.

2. ``execute_trade`` — the atomic application service, exercised with
   in-memory fake repos that implement the Protocol contracts. Asserts
   end-to-end behaviour PLUS the invariants the user explicitly worried
   about: cash conservation on a round-trip, exact-zero residue on a
   full close, cost-averaging coherence across multiple buys.

3. A hypothesis property block covers random sequences for those
   invariants — structurally impossible to bias toward the
   implementation since no specific number is asserted, only the
   property.
"""

from dataclasses import dataclass, field, replace
from datetime import UTC, datetime

import pytest
from hypothesis import given
from hypothesis import strategies as st

from src.application.trade_execution import (
    TradeError,
    TradeRequest,
    _compute_new_avg,
    execute_trade,
)
from src.domain.portfolio.portfolio import Holding, Portfolio, Trade, TradeKind

# ---------------------------------------------------------------------------
# 1. _compute_new_avg — six branches, literal expected values from the
# weighted-average formula computed by hand (NOT from running the code).
# ---------------------------------------------------------------------------


def test_buy_open_long_from_flat() -> None:
    # No prior position, buy 10 at 5.0 → avg = 5.0 (only fill).
    assert _compute_new_avg(prev_shares=0.0, prev_avg=0.0, kind=TradeKind.BUY, qty=10.0, price=5.0) == 5.0


def test_buy_extends_long_weighted_average() -> None:
    # Held 10 shares at avg 4.0 → bought 10 more at 6.0.
    # Weighted: (10*4 + 10*6) / 20 = 100/20 = 5.0.
    assert _compute_new_avg(prev_shares=10.0, prev_avg=4.0, kind=TradeKind.BUY, qty=10.0, price=6.0) == 5.0


def test_buy_covers_short_partially_avg_unchanged() -> None:
    # Short 10 at avg-open 5.0 → buy 4 to cover. Still short 6 → avg of
    # the REMAINING open side unchanged (5.0).
    assert _compute_new_avg(prev_shares=-10.0, prev_avg=5.0, kind=TradeKind.BUY, qty=4.0, price=8.0) == 5.0


def test_buy_crosses_short_to_long_resets_avg_to_fill() -> None:
    # Short 5 at avg-open 5.0 → buy 12 → flips to long 7. Cost basis
    # of the new long leg = the fill price 8.0 (per the spec).
    assert _compute_new_avg(prev_shares=-5.0, prev_avg=5.0, kind=TradeKind.BUY, qty=12.0, price=8.0) == 8.0


def test_sell_open_short_from_flat() -> None:
    # No prior, sell 10 at 5.0 → opens a short; avg-open = 5.0.
    assert _compute_new_avg(prev_shares=0.0, prev_avg=0.0, kind=TradeKind.SELL, qty=10.0, price=5.0) == 5.0


def test_sell_extends_short_weighted_average() -> None:
    # Short 10 at avg-open 4.0 → sell 10 more at 6.0.
    # |prev_open|=10, denom=20 → (10*4 + 10*6)/20 = 5.0.
    assert _compute_new_avg(prev_shares=-10.0, prev_avg=4.0, kind=TradeKind.SELL, qty=10.0, price=6.0) == 5.0


def test_sell_reduces_long_avg_unchanged() -> None:
    # Long 10 at avg 4.0 → sell 6 → still long 4; cost basis unchanged.
    assert _compute_new_avg(prev_shares=10.0, prev_avg=4.0, kind=TradeKind.SELL, qty=6.0, price=9.0) == 4.0


def test_sell_crosses_long_to_short_resets_avg_to_fill() -> None:
    # Long 5 at avg 4.0 → sell 12 → flips short 7; new short basis = fill 9.0.
    assert _compute_new_avg(prev_shares=5.0, prev_avg=4.0, kind=TradeKind.SELL, qty=12.0, price=9.0) == 9.0


def test_avg_rounded_to_two_decimals_after_weighting() -> None:
    # 3 * 7.10 + 7 * 7.20 = 21.30 + 50.40 = 71.70 ; /10 = 7.17 exact.
    assert _compute_new_avg(prev_shares=3.0, prev_avg=7.10, kind=TradeKind.BUY, qty=7.0, price=7.20) == 7.17


# ---------------------------------------------------------------------------
# 2. execute_trade — in-memory fake repos + literal invariant checks.
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class _FakePortfolioRepo:
    portfolios: dict[int, Portfolio] = field(default_factory=dict)
    holdings: dict[tuple[int, int], Holding] = field(default_factory=dict)

    async def get_by_user_id(self, user_id: int) -> Portfolio | None:  # pragma: no cover — unused by execute_trade
        for p in self.portfolios.values():
            if p.user_id == user_id:
                return p
        return None

    async def create_for_user(self, *, user_id: int, cash: float) -> Portfolio:  # pragma: no cover
        now = datetime.now(UTC)
        pid = max(self.portfolios.keys(), default=0) + 1
        p = Portfolio(id=pid, user_id=user_id, cash=cash, created_at=now, updated_at=now)
        self.portfolios[pid] = p
        return p

    async def update_cash(self, *, portfolio_id: int, new_cash: float) -> None:
        self.portfolios[portfolio_id] = replace(self.portfolios[portfolio_id], cash=new_cash)

    async def list_holdings(self, portfolio_id: int) -> list[Holding]:  # pragma: no cover
        return [h for (pid, _), h in self.holdings.items() if pid == portfolio_id]

    async def get_holding(self, *, portfolio_id: int, player_id: int) -> Holding | None:
        return self.holdings.get((portfolio_id, player_id))

    async def upsert_holding(self, holding: Holding) -> None:
        self.holdings[(holding.portfolio_id, holding.player_id)] = holding

    async def delete_holding(self, *, portfolio_id: int, player_id: int) -> None:
        self.holdings.pop((portfolio_id, player_id), None)


@dataclass(slots=True)
class _FakeTradeRepo:
    trades: list[Trade] = field(default_factory=list)

    async def append(self, trade: Trade) -> Trade:
        recorded = replace(trade, id=len(self.trades) + 1)
        self.trades.append(recorded)
        return recorded

    async def list_by_portfolio(self, portfolio_id: int, *, limit: int = 200) -> list[Trade]:  # pragma: no cover
        return [t for t in self.trades if t.portfolio_id == portfolio_id][:limit]


def _portfolio(cash: float) -> Portfolio:
    now = datetime.now(UTC)
    return Portfolio(id=1, user_id=1, cash=cash, created_at=now, updated_at=now)


def _repos(
    cash: float, *, with_holding: Holding | None = None
) -> tuple[_FakePortfolioRepo, _FakeTradeRepo, Portfolio]:
    p = _portfolio(cash)
    pr = _FakePortfolioRepo(portfolios={p.id: p})
    if with_holding:
        pr.holdings[(p.id, with_holding.player_id)] = with_holding
    return pr, _FakeTradeRepo(), p


# Helper: run an async coroutine in tests without pytest-anyio (these are
# unit tests over pure-ish functions — keep dependencies minimal).
def _run(coro):  # type: ignore[no-untyped-def]
    import asyncio

    return asyncio.new_event_loop().run_until_complete(coro)


def test_buy_from_flat_creates_holding_and_debits_cash_exactly() -> None:
    pr, tr, p = _repos(cash=100.0)
    out = _run(
        execute_trade(
            request=TradeRequest(portfolio_id=p.id, player_id=42, kind=TradeKind.BUY, shares=4.0, price=5.0),
            portfolio=p,
            portfolio_repo=pr,
            trade_repo=tr,
        )
    )
    # Literal: 4 shares * €5 = €20 ; cash 100 - 20 = 80.
    assert out.portfolio.cash == 80.0
    assert out.holding is not None
    assert out.holding.shares == 4.0
    assert out.holding.average_buy_price == 5.0
    assert out.trade.total == 20.0
    # Repo state mirrors the outcome.
    assert pr.portfolios[p.id].cash == 80.0
    assert pr.holdings[(p.id, 42)].shares == 4.0


def test_buy_then_sell_same_quantity_same_price_closes_position_and_restores_cash() -> None:
    """Round-trip neutrality — the central invariant. After buying N at
    p and selling N at p, the holding must be GONE (not 1e-9 shares) and
    cash must be EXACTLY back to the starting value."""
    pr, tr, p = _repos(cash=100.0)
    after_buy = _run(
        execute_trade(
            request=TradeRequest(p.id, 42, TradeKind.BUY, shares=3.0, price=7.5),
            portfolio=p,
            portfolio_repo=pr,
            trade_repo=tr,
        )
    )
    after_sell = _run(
        execute_trade(
            request=TradeRequest(p.id, 42, TradeKind.SELL, shares=3.0, price=7.5),
            portfolio=after_buy.portfolio,
            portfolio_repo=pr,
            trade_repo=tr,
        )
    )
    assert after_sell.holding is None  # position fully closed → deleted
    assert (p.id, 42) not in pr.holdings  # repo also wiped
    assert after_sell.portfolio.cash == 100.0  # cash exact, no residue


def test_partial_sell_keeps_avg_buy_unchanged_and_subtracts_shares_exactly() -> None:
    pr, tr, p = _repos(
        cash=50.0, with_holding=Holding(portfolio_id=1, player_id=7, shares=10.0, average_buy_price=4.0)
    )
    out = _run(
        execute_trade(
            request=TradeRequest(p.id, 7, TradeKind.SELL, shares=4.0, price=9.0),
            portfolio=p,
            portfolio_repo=pr,
            trade_repo=tr,
        )
    )
    assert out.holding is not None
    assert out.holding.shares == 6.0  # 10 - 4 exact
    assert out.holding.average_buy_price == 4.0  # cost basis unchanged on a partial reduction
    assert out.portfolio.cash == 50.0 + 36.0  # 4 * 9 = 36 credit


def test_insufficient_cash_raises_without_mutating_anything() -> None:
    pr, tr, p = _repos(cash=10.0)
    with pytest.raises(TradeError, match="insufficient cash"):
        _run(
            execute_trade(
                request=TradeRequest(p.id, 1, TradeKind.BUY, shares=5.0, price=10.0),  # needs 50
                portfolio=p,
                portfolio_repo=pr,
                trade_repo=tr,
            )
        )
    # Nothing was mutated — full transactional invariant.
    assert pr.portfolios[p.id].cash == 10.0
    assert pr.holdings == {}
    assert tr.trades == []


def test_full_close_is_exact_even_with_quantum_shares() -> None:
    """The residue concern: buy 0.1+0.2 worth shares (notoriously
    imprecise in float), then sell the exact sum. The holding must be
    deleted, not left at 5e-17 shares."""
    pr, tr, p = _repos(cash=10.0)
    _ = _run(
        execute_trade(
            request=TradeRequest(p.id, 9, TradeKind.BUY, shares=0.1, price=1.0),
            portfolio=p,
            portfolio_repo=pr,
            trade_repo=tr,
        )
    )
    after2 = _run(
        execute_trade(
            request=TradeRequest(p.id, 9, TradeKind.BUY, shares=0.2, price=1.0),
            portfolio=pr.portfolios[p.id],
            portfolio_repo=pr,
            trade_repo=tr,
        )
    )
    # held = 0.1 + 0.2 = 0.30000000000000004 in float — by design, not a bug.
    assert after2.holding is not None
    held = after2.holding.shares
    # Now close the EXACT held amount — execute_trade's |new_shares| <= 1e-6
    # threshold must delete the position, no dust.
    after3 = _run(
        execute_trade(
            request=TradeRequest(p.id, 9, TradeKind.SELL, shares=held, price=1.0),
            portfolio=after2.portfolio,
            portfolio_repo=pr,
            trade_repo=tr,
        )
    )
    assert after3.holding is None
    assert (p.id, 9) not in pr.holdings


# ---------------------------------------------------------------------------
# 3. Property-based — random sequences against invariants only.
# ---------------------------------------------------------------------------

_shares = st.floats(min_value=0.1, max_value=100.0, allow_nan=False, allow_infinity=False)
_price = st.floats(min_value=0.01, max_value=200.0, allow_nan=False, allow_infinity=False)


@given(shares=_shares, price=_price)
def test_property_round_trip_buy_then_sell_is_cash_neutral(shares: float, price: float) -> None:
    """For ANY shares/price the user can AFFORD, buying then selling the
    same quantity at the same price returns cash to its starting value
    and removes the holding. (Within 2dp rounding on ``total``.)"""
    pr, tr, p = _repos(cash=10_000.0)
    try:
        out_buy = _run(
            execute_trade(
                request=TradeRequest(p.id, 1, TradeKind.BUY, shares=shares, price=price),
                portfolio=p,
                portfolio_repo=pr,
                trade_repo=tr,
            )
        )
    except TradeError:
        return  # insufficient cash for THIS random sample — precondition not met, skip
    out_sell = _run(
        execute_trade(
            request=TradeRequest(p.id, 1, TradeKind.SELL, shares=shares, price=price),
            portfolio=out_buy.portfolio,
            portfolio_repo=pr,
            trade_repo=tr,
        )
    )
    assert out_sell.holding is None
    # 2dp rounding on ``total`` => cash residue bounded by 0.01.
    assert abs(out_sell.portfolio.cash - 10_000.0) <= 0.01


@given(shares=_shares, price=_price)
def test_property_cash_delta_equals_trade_total_for_buy(shares: float, price: float) -> None:
    """Cash conservation: the cash DEBITED by a buy equals the trade
    total exactly — they are the two numbers the user sees and they
    must agree on every input.

    We compare delta to ``out.trade.total`` and NOT to a recomputed
    ``round(shares*price, 2)``: the kernel rounds ``total`` to 2 dp
    monetary precision BEFORE debiting cash; recomputing the expected
    from raw inputs uses a single global rounding and diverges on the
    .005 boundary (caught by hypothesis on shares=1.5 price=0.01).
    The invariant we care about is the two-numbers-agree property.
    """
    pr, tr, p = _repos(cash=1_000_000.0)
    out = _run(
        execute_trade(
            request=TradeRequest(p.id, 1, TradeKind.BUY, shares=shares, price=price),
            portfolio=p,
            portfolio_repo=pr,
            trade_repo=tr,
        )
    )
    cash_delta = round(1_000_000.0 - out.portfolio.cash, 2)
    assert cash_delta == out.trade.total


@given(prev_shares=st.floats(min_value=0.0, max_value=50.0), prev_avg=_price, qty=_shares, price=_price)
def test_property_extending_long_avg_is_between_prev_and_fill(
    prev_shares: float, prev_avg: float, qty: float, price: float
) -> None:
    """Weighted average of two positive prices stays in [min, max] of
    those prices — independent of the weights. Catches a wrong-direction
    update (e.g. always returning the latest fill or always the previous
    avg)."""
    new_avg = _compute_new_avg(prev_shares=prev_shares, prev_avg=prev_avg, kind=TradeKind.BUY, qty=qty, price=price)
    # Rounding to 2dp can push by at most 0.005 outside the bounds.
    lo = min(prev_avg, price) - 0.01
    hi = max(prev_avg, price) + 0.01
    assert lo <= new_avg <= hi
