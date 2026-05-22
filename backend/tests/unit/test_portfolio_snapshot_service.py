"""Unit tests for PortfolioSnapshotService.

The math here is dead simple (cash + sum of shares x price, with a flat
fallback to ``average_buy_price`` for players not yet ticked) — so each
expected value below is computed BY HAND from the inputs, NOT by
re-running the service's own helpers. That keeps the tests adversarial
to the implementation (a regression in the formula does not silently
re-derive a matching expected value).
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime

import pytest

from src.application.portfolio_snapshot_service import (
    PortfolioSnapshotService,
    _bucket_to_minute,
    _compute_holdings_value,
)
from src.domain.portfolio.portfolio import Holding, Portfolio
from src.domain.portfolio.portfolio_snapshot import PortfolioSnapshot

pytestmark = pytest.mark.anyio


# ---------------------------------------------------------------------------
# Pure helpers — testable in isolation.
# ---------------------------------------------------------------------------


def test_bucket_to_minute_truncates_seconds_and_microseconds() -> None:
    raw = datetime(2026, 5, 20, 14, 23, 45, 678_901, tzinfo=UTC)
    expected = datetime(2026, 5, 20, 14, 23, 0, 0, tzinfo=UTC)
    assert _bucket_to_minute(raw) == expected


def test_bucket_to_minute_preserves_already_truncated() -> None:
    raw = datetime(2026, 5, 20, 14, 23, 0, 0, tzinfo=UTC)
    assert _bucket_to_minute(raw) == raw


def test_compute_holdings_value_sums_shares_times_price() -> None:
    holdings = [
        Holding(portfolio_id=1, player_id=10, shares=5.0, average_buy_price=2.0),
        Holding(portfolio_id=1, player_id=20, shares=3.0, average_buy_price=4.0),
    ]
    prices = {10: 10.0, 20: 20.0}
    # Hand: 5*10 + 3*20 = 50 + 60 = 110.0
    assert _compute_holdings_value(holdings, prices) == 110.0


def test_compute_holdings_value_falls_back_to_avg_when_no_tick() -> None:
    holdings = [
        Holding(portfolio_id=1, player_id=10, shares=2.0, average_buy_price=7.5),
        Holding(portfolio_id=1, player_id=20, shares=4.0, average_buy_price=3.0),
    ]
    prices: dict[int, float] = {10: 8.0}  # 20 never ticked → fallback to 3.0
    # Hand: 2*8 + 4*3 = 16 + 12 = 28.0
    assert _compute_holdings_value(holdings, prices) == 28.0


def test_compute_holdings_value_short_position_subtracts() -> None:
    # Short 5 shares at open price 10 (avg=10), latest tick 12.
    # Hand: -5 * 12 = -60 (short up = loss is correct sign).
    holdings = [Holding(portfolio_id=1, player_id=10, shares=-5.0, average_buy_price=10.0)]
    prices = {10: 12.0}
    assert _compute_holdings_value(holdings, prices) == -60.0


def test_compute_holdings_value_empty_returns_zero() -> None:
    assert _compute_holdings_value([], {}) == 0.0


# ---------------------------------------------------------------------------
# Fake adapters — in-memory implementations of the four ports.
# Deliberately minimal: each only does what the tests below require.
# ---------------------------------------------------------------------------


@dataclass
class FakePortfolioRepo:
    portfolios: dict[int, Portfolio] = field(default_factory=dict)
    holdings_by_portfolio: dict[int, list[Holding]] = field(default_factory=dict)

    async def get_by_user_id(self, user_id: int) -> Portfolio | None:  # pragma: no cover
        raise NotImplementedError

    async def create_for_user(self, *, user_id: int, cash: float) -> Portfolio:  # pragma: no cover
        raise NotImplementedError

    async def update_cash(self, *, portfolio_id: int, new_cash: float) -> None:  # pragma: no cover
        raise NotImplementedError

    async def list_holdings(self, portfolio_id: int) -> list[Holding]:
        return list(self.holdings_by_portfolio.get(portfolio_id, []))

    async def get_holding(self, *, portfolio_id: int, player_id: int):  # pragma: no cover
        raise NotImplementedError

    async def upsert_holding(self, holding: Holding) -> None:  # pragma: no cover
        raise NotImplementedError

    async def delete_holding(self, *, portfolio_id: int, player_id: int) -> None:  # pragma: no cover
        raise NotImplementedError


@dataclass
class FakeSnapshotRepo:
    """Stores snapshots in-memory keyed by (portfolio_id, ts). Upsert
    overwrites — same semantics as the SQL adapter."""

    rows: dict[tuple[int, datetime], PortfolioSnapshot] = field(default_factory=dict)

    async def upsert(self, snapshot: PortfolioSnapshot) -> None:
        self.rows[(snapshot.portfolio_id, snapshot.ts)] = snapshot

    async def upsert_many(self, snapshots: list[PortfolioSnapshot]) -> None:
        for s in snapshots:
            self.rows[(s.portfolio_id, s.ts)] = s

    async def list_range(self, *, portfolio_id: int, since, until) -> list[PortfolioSnapshot]:
        out = [s for (pid, _), s in self.rows.items() if pid == portfolio_id]
        out.sort(key=lambda s: s.ts)
        if since is not None:
            out = [s for s in out if s.ts >= since]
        if until is not None:
            out = [s for s in out if s.ts <= until]
        return out

    async def get_open_value(self, portfolio_id: int) -> float | None:
        snaps = [s for (pid, _), s in self.rows.items() if pid == portfolio_id]
        if not snaps:
            return None
        snaps.sort(key=lambda s: s.ts)
        return snaps[0].value


@dataclass
class FakeDirtyResolver:
    holders_by_player: dict[int, set[int]] = field(default_factory=dict)

    async def find_holders_of(self, player_ids: Iterable[int]) -> list[int]:
        out: set[int] = set()
        for pid in player_ids:
            out |= self.holders_by_player.get(pid, set())
        return sorted(out)


@dataclass
class FakePriceProvider:
    prices: dict[int, float] = field(default_factory=dict)

    async def get_many(self, player_ids: Iterable[int]) -> dict[int, float]:
        return {pid: self.prices[pid] for pid in player_ids if pid in self.prices}


@dataclass
class FakePortfolioReader:
    by_id: dict[int, tuple[int, float]] = field(default_factory=dict)

    async def get_by_id(self, portfolio_id: int) -> tuple[int, float] | None:
        return self.by_id.get(portfolio_id)


def _build_service(
    *,
    portfolios: dict[int, Portfolio],
    holdings: dict[int, list[Holding]],
    holders_by_player: dict[int, set[int]],
    prices: dict[int, float],
    cash_by_portfolio: dict[int, float],
    seed_snapshots: list[PortfolioSnapshot] | None = None,
) -> tuple[PortfolioSnapshotService, FakeSnapshotRepo]:
    snap_repo = FakeSnapshotRepo()
    if seed_snapshots:
        for s in seed_snapshots:
            snap_repo.rows[(s.portfolio_id, s.ts)] = s
    service = PortfolioSnapshotService(
        portfolio_repo=FakePortfolioRepo(portfolios=portfolios, holdings_by_portfolio=holdings),
        snapshot_repo=snap_repo,
        dirty_resolver=FakeDirtyResolver(holders_by_player=holders_by_player),
        price_provider=FakePriceProvider(prices=prices),
        portfolio_reader=FakePortfolioReader(by_id=cash_by_portfolio_to_reader(cash_by_portfolio)),
    )
    return service, snap_repo


def cash_by_portfolio_to_reader(cash: dict[int, float]) -> dict[int, tuple[int, float]]:
    return {pid: (pid, c) for pid, c in cash.items()}


# ---------------------------------------------------------------------------
# materialize_for_player_ticks
# ---------------------------------------------------------------------------


async def test_materialize_writes_one_row_per_dirty_portfolio() -> None:
    """Portfolios 1 + 2 both hold player 10 → both dirty when 10 ticks."""
    p1 = Portfolio(
        id=1, user_id=11, cash=100.0,
        created_at=datetime(2026, 5, 1, tzinfo=UTC),
        updated_at=datetime(2026, 5, 1, tzinfo=UTC),
    )
    p2 = Portfolio(
        id=2, user_id=12, cash=200.0,
        created_at=datetime(2026, 5, 1, tzinfo=UTC),
        updated_at=datetime(2026, 5, 1, tzinfo=UTC),
    )
    h1 = Holding(portfolio_id=1, player_id=10, shares=2.0, average_buy_price=3.0)
    h2 = Holding(portfolio_id=2, player_id=10, shares=5.0, average_buy_price=3.0)
    service, snap_repo = _build_service(
        portfolios={1: p1, 2: p2},
        holdings={1: [h1], 2: [h2]},
        holders_by_player={10: {1, 2}},
        prices={10: 4.0},
        cash_by_portfolio={1: 100.0, 2: 200.0},
    )

    ts = datetime(2026, 5, 20, 14, 23, 45, tzinfo=UTC)
    written = await service.materialize_for_player_ticks(ticked_player_ids=[10], ts=ts)

    assert written == 2
    bucket = datetime(2026, 5, 20, 14, 23, 0, tzinfo=UTC)
    # Portfolio 1: cash=100, holdings = 2 * 4 = 8 → value = 108, pnl = 0 (open).
    assert snap_repo.rows[(1, bucket)] == PortfolioSnapshot(
        portfolio_id=1, ts=bucket, cash=100.0, holdings_value=8.0, value=108.0, pnl_vs_open=0.0
    )
    # Portfolio 2: cash=200, holdings = 5 * 4 = 20 → value = 220, pnl = 0.
    assert snap_repo.rows[(2, bucket)] == PortfolioSnapshot(
        portfolio_id=2, ts=bucket, cash=200.0, holdings_value=20.0, value=220.0, pnl_vs_open=0.0
    )


async def test_materialize_skips_when_no_dirty_portfolio() -> None:
    """A tick on a player nobody holds → zero writes."""
    p1 = Portfolio(
        id=1, user_id=11, cash=100.0,
        created_at=datetime(2026, 5, 1, tzinfo=UTC),
        updated_at=datetime(2026, 5, 1, tzinfo=UTC),
    )
    service, snap_repo = _build_service(
        portfolios={1: p1},
        holdings={1: []},
        holders_by_player={},  # nobody holds player 99
        prices={99: 5.0},
        cash_by_portfolio={1: 100.0},
    )
    written = await service.materialize_for_player_ticks(
        ticked_player_ids=[99], ts=datetime(2026, 5, 20, 14, 23, tzinfo=UTC)
    )
    assert written == 0
    assert snap_repo.rows == {}


async def test_materialize_collapses_minute_bucket() -> None:
    """Two ticks 30s apart in the same minute → one row (last value wins)."""
    p1 = Portfolio(
        id=1, user_id=11, cash=50.0,
        created_at=datetime(2026, 5, 1, tzinfo=UTC),
        updated_at=datetime(2026, 5, 1, tzinfo=UTC),
    )
    h1 = Holding(portfolio_id=1, player_id=10, shares=10.0, average_buy_price=1.0)
    service, snap_repo = _build_service(
        portfolios={1: p1},
        holdings={1: [h1]},
        holders_by_player={10: {1}},
        prices={10: 2.0},
        cash_by_portfolio={1: 50.0},
    )

    bucket = datetime(2026, 5, 20, 14, 23, 0, tzinfo=UTC)
    # First tick at 14:23:10
    await service.materialize_for_player_ticks(
        ticked_player_ids=[10],
        ts=datetime(2026, 5, 20, 14, 23, 10, tzinfo=UTC),
    )
    # Bump the price between ticks.
    service.price_provider.prices[10] = 3.0  # type: ignore[attr-defined]
    # Second tick at 14:23:50 — SAME minute.
    await service.materialize_for_player_ticks(
        ticked_player_ids=[10],
        ts=datetime(2026, 5, 20, 14, 23, 50, tzinfo=UTC),
    )
    # Exactly one row, value reflecting the second tick.
    same_minute = [k for k in snap_repo.rows if k[1] == bucket]
    assert len(same_minute) == 1
    # 50 cash + 10 shares * 3.0 = 80.0
    assert snap_repo.rows[(1, bucket)].value == 80.0
    assert snap_repo.rows[(1, bucket)].holdings_value == 30.0


async def test_materialize_uses_avg_buy_price_when_player_never_ticked() -> None:
    """A portfolio holds player 20 that has no tick yet. Player 10 ticks.
    Holdings_value uses 10's tick price + 20's average_buy_price fallback."""
    p1 = Portfolio(
        id=1, user_id=11, cash=10.0,
        created_at=datetime(2026, 5, 1, tzinfo=UTC),
        updated_at=datetime(2026, 5, 1, tzinfo=UTC),
    )
    h10 = Holding(portfolio_id=1, player_id=10, shares=3.0, average_buy_price=5.0)
    h20 = Holding(portfolio_id=1, player_id=20, shares=2.0, average_buy_price=7.0)
    service, snap_repo = _build_service(
        portfolios={1: p1},
        holdings={1: [h10, h20]},
        holders_by_player={10: {1}},
        prices={10: 6.0},  # 20 deliberately absent
        cash_by_portfolio={1: 10.0},
    )

    ts = datetime(2026, 5, 20, 14, 0, tzinfo=UTC)
    await service.materialize_for_player_ticks(ticked_player_ids=[10], ts=ts)
    # Hand: 3*6 + 2*7 = 18 + 14 = 32 holdings; cash 10 → value 42.
    snap = snap_repo.rows[(1, ts)]
    assert snap.holdings_value == 32.0
    assert snap.value == 42.0


async def test_materialize_pnl_vs_open_uses_first_snapshot_as_baseline() -> None:
    """An earlier snapshot exists at value=100. New snapshot at value=120 →
    pnl_vs_open = 20 (not 0)."""
    p1 = Portfolio(
        id=1, user_id=11, cash=100.0,
        created_at=datetime(2026, 5, 1, tzinfo=UTC),
        updated_at=datetime(2026, 5, 1, tzinfo=UTC),
    )
    open_ts = datetime(2026, 5, 19, 12, 0, tzinfo=UTC)
    opening_snap = PortfolioSnapshot(
        portfolio_id=1, ts=open_ts,
        cash=100.0, holdings_value=0.0, value=100.0, pnl_vs_open=0.0,
    )
    h1 = Holding(portfolio_id=1, player_id=10, shares=2.0, average_buy_price=5.0)
    service, snap_repo = _build_service(
        portfolios={1: p1},
        holdings={1: [h1]},
        holders_by_player={10: {1}},
        prices={10: 10.0},
        cash_by_portfolio={1: 100.0},
        seed_snapshots=[opening_snap],
    )

    new_ts = datetime(2026, 5, 20, 14, 0, tzinfo=UTC)
    await service.materialize_for_player_ticks(ticked_player_ids=[10], ts=new_ts)
    # Hand: cash 100 + (2 * 10) = 120 ; pnl_vs_open = 120 - 100 = 20.
    new_snap = snap_repo.rows[(1, new_ts)]
    assert new_snap.value == 120.0
    assert new_snap.pnl_vs_open == 20.0


# ---------------------------------------------------------------------------
# bootstrap
# ---------------------------------------------------------------------------


async def test_bootstrap_writes_initial_snapshot_with_zero_pnl() -> None:
    p1 = Portfolio(
        id=1, user_id=11, cash=100.0,
        created_at=datetime(2026, 5, 1, tzinfo=UTC),
        updated_at=datetime(2026, 5, 1, tzinfo=UTC),
    )
    service, snap_repo = _build_service(
        portfolios={1: p1},
        holdings={1: []},
        holders_by_player={},
        prices={},
        cash_by_portfolio={1: 100.0},
    )
    opened_at = datetime(2026, 5, 1, 9, 30, 12, tzinfo=UTC)
    await service.bootstrap(1, opened_at=opened_at)
    bucket = datetime(2026, 5, 1, 9, 30, 0, tzinfo=UTC)
    assert snap_repo.rows[(1, bucket)] == PortfolioSnapshot(
        portfolio_id=1, ts=bucket,
        cash=100.0, holdings_value=0.0, value=100.0, pnl_vs_open=0.0,
    )


async def test_bootstrap_is_noop_when_portfolio_unknown() -> None:
    service, snap_repo = _build_service(
        portfolios={},
        holdings={},
        holders_by_player={},
        prices={},
        cash_by_portfolio={},
    )
    await service.bootstrap(999, opened_at=datetime(2026, 5, 1, tzinfo=UTC))
    assert snap_repo.rows == {}
