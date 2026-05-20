"""Unit tests for PortfolioHistoryService.

Two responsibilities under test:
1. Range presets ("24h" / "7d" / "30d" / "all") map to a correct
   ``since`` cutoff applied to the snapshot read.
2. The live tail point is appended OR replaces the current-minute
   bucket when present (last-write-wins semantics match the writer).
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import pytest

from src.application.portfolio_history_service import (
    HistoryRange,
    PortfolioHistoryService,
)
from src.domain.portfolio.portfolio import Holding, Portfolio
from src.domain.portfolio.portfolio_snapshot import PortfolioSnapshot

pytestmark = pytest.mark.anyio


# Re-use the fakes shape from the snapshot-service tests but minimal here.

@dataclass
class FakePortfolioRepo:
    holdings_by_portfolio: dict[int, list[Holding]] = field(default_factory=dict)

    async def get_by_user_id(self, user_id: int):  # pragma: no cover
        raise NotImplementedError

    async def create_for_user(self, *, user_id: int, cash: float):  # pragma: no cover
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
    rows: list[PortfolioSnapshot] = field(default_factory=list)
    last_since: datetime | None = None

    async def upsert(self, snapshot: PortfolioSnapshot) -> None:  # pragma: no cover
        self.rows.append(snapshot)

    async def upsert_many(self, snapshots: list[PortfolioSnapshot]) -> None:  # pragma: no cover
        self.rows.extend(snapshots)

    async def list_range(self, *, portfolio_id: int, since, until) -> list[PortfolioSnapshot]:
        self.last_since = since
        out = [s for s in self.rows if s.portfolio_id == portfolio_id]
        out.sort(key=lambda s: s.ts)
        if since is not None:
            out = [s for s in out if s.ts >= since]
        if until is not None:
            out = [s for s in out if s.ts <= until]
        return out

    async def get_open_value(self, portfolio_id: int) -> float | None:
        snaps = [s for s in self.rows if s.portfolio_id == portfolio_id]
        if not snaps:
            return None
        snaps.sort(key=lambda s: s.ts)
        return snaps[0].value


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


def _build(
    *,
    snapshots: list[PortfolioSnapshot],
    holdings: dict[int, list[Holding]],
    prices: dict[int, float],
    cash: dict[int, float],
    now: datetime,
) -> tuple[PortfolioHistoryService, FakeSnapshotRepo]:
    snap = FakeSnapshotRepo(rows=list(snapshots))
    service = PortfolioHistoryService(
        portfolio_repo=FakePortfolioRepo(holdings_by_portfolio=holdings),
        snapshot_repo=snap,
        price_provider=FakePriceProvider(prices=prices),
        portfolio_reader=FakePortfolioReader(by_id={pid: (pid, c) for pid, c in cash.items()}),
        now_fn=lambda _tz: now,
    )
    return service, snap


# ---------------------------------------------------------------------------
# Range presets
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("preset", "expected_delta"),
    [
        (HistoryRange.LAST_24H, timedelta(hours=24)),
        (HistoryRange.LAST_7D, timedelta(days=7)),
        (HistoryRange.LAST_30D, timedelta(days=30)),
    ],
)
async def test_range_presets_apply_since_cutoff(preset: HistoryRange, expected_delta: timedelta) -> None:
    now = datetime(2026, 5, 20, 14, 0, tzinfo=UTC)
    service, snap_repo = _build(
        snapshots=[],
        holdings={1: []},
        prices={},
        cash={1: 50.0},
        now=now,
    )
    await service.read(portfolio_id=1, range_=preset)
    assert snap_repo.last_since == now - expected_delta


async def test_range_all_passes_none_since() -> None:
    now = datetime(2026, 5, 20, 14, 0, tzinfo=UTC)
    service, snap_repo = _build(
        snapshots=[],
        holdings={1: []},
        prices={},
        cash={1: 50.0},
        now=now,
    )
    await service.read(portfolio_id=1, range_=HistoryRange.ALL)
    assert snap_repo.last_since is None


# ---------------------------------------------------------------------------
# Live tail stitching
# ---------------------------------------------------------------------------


async def test_live_point_appended_when_no_current_minute_bucket() -> None:
    """History has rows older than the current minute → live point appended."""
    now = datetime(2026, 5, 20, 14, 5, 30, tzinfo=UTC)
    open_snap = PortfolioSnapshot(
        portfolio_id=1, ts=datetime(2026, 5, 19, tzinfo=UTC),
        cash=100.0, holdings_value=0.0, value=100.0, pnl_vs_open=0.0,
    )
    older = PortfolioSnapshot(
        portfolio_id=1, ts=datetime(2026, 5, 20, 13, 50, tzinfo=UTC),
        cash=100.0, holdings_value=20.0, value=120.0, pnl_vs_open=20.0,
    )
    h1 = Holding(portfolio_id=1, player_id=10, shares=2.0, average_buy_price=5.0)
    service, _ = _build(
        snapshots=[open_snap, older],
        holdings={1: [h1]},
        prices={10: 15.0},  # live tick price
        cash={1: 100.0},
        now=now,
    )
    points = await service.read(portfolio_id=1, range_=HistoryRange.ALL)
    assert len(points) == 3
    live_bucket = datetime(2026, 5, 20, 14, 5, 0, tzinfo=UTC)
    assert points[-1].ts == live_bucket
    # Hand: 100 cash + 2 shares * 15 = 130; open=100 → pnl=30.
    assert points[-1].value == 130.0
    assert points[-1].pnl_vs_open == 30.0


async def test_live_point_overrides_existing_current_minute_bucket() -> None:
    """A snapshot already exists at the current minute → it is REPLACED
    by the freshly-computed live value (same last-write-wins semantics
    as the writer)."""
    now = datetime(2026, 5, 20, 14, 5, 30, tzinfo=UTC)
    current_bucket = datetime(2026, 5, 20, 14, 5, 0, tzinfo=UTC)
    open_snap = PortfolioSnapshot(
        portfolio_id=1, ts=datetime(2026, 5, 19, tzinfo=UTC),
        cash=100.0, holdings_value=0.0, value=100.0, pnl_vs_open=0.0,
    )
    stale_current = PortfolioSnapshot(
        portfolio_id=1, ts=current_bucket,
        cash=100.0, holdings_value=10.0, value=110.0, pnl_vs_open=10.0,
    )
    h1 = Holding(portfolio_id=1, player_id=10, shares=2.0, average_buy_price=5.0)
    service, _ = _build(
        snapshots=[open_snap, stale_current],
        holdings={1: [h1]},
        prices={10: 20.0},  # newer than stale_current
        cash={1: 100.0},
        now=now,
    )
    points = await service.read(portfolio_id=1, range_=HistoryRange.ALL)
    # Still 2 points (open + current bucket replaced, not added).
    assert len(points) == 2
    # Hand: 100 + 2*20 = 140 ; pnl = 40 (vs open=100).
    assert points[-1].value == 140.0
    assert points[-1].pnl_vs_open == 40.0


async def test_read_returns_empty_when_portfolio_unknown() -> None:
    """No portfolio in the reader → live point cannot be computed; only
    the historical query result is returned (here also empty)."""
    now = datetime(2026, 5, 20, 14, 0, tzinfo=UTC)
    service, _ = _build(
        snapshots=[],
        holdings={},
        prices={},
        cash={},
        now=now,
    )
    points = await service.read(portfolio_id=999, range_=HistoryRange.ALL)
    assert points == []
