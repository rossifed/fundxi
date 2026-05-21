"""PortfolioHistoryService — read API for the portfolio value curve.

DDD role: Application Service. Single entry point for the BFF router
``GET /api/portfolio/history``. Combines two sources:

1. **Historical buckets** — read from ``valuation.portfolio_value_snapshot``
   for the requested range. One row per (portfolio, minute).
2. **Live tail** — the current ``cash + sum(shares * latest_price)`` value,
   appended as the last point so the chart never lags the live KPIs by
   more than one tick.

The "live tail" stitching matters: the bucket of the current minute
may not be persisted yet (the snapshot is written asynchronously by
the valuation worker post-batch). Computing it on read gives the
user a sub-second-fresh value at the rightmost point of the chart,
without paying for a write per tick.

Range presets ("24h", "7d", "30d", "all") map to a ``since`` cutoff.
``all`` returns from the portfolio's open snapshot to now.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Protocol

from src.domain.portfolio.portfolio import PortfolioRepository
from src.domain.portfolio.portfolio_snapshot import (
    PortfolioSnapshot,
    PortfolioSnapshotRepository,
)


class HistoryRange(StrEnum):
    LAST_24H = "24h"
    LAST_7D = "7d"
    LAST_30D = "30d"
    ALL = "all"


_RANGE_DELTAS: dict[HistoryRange, timedelta | None] = {
    HistoryRange.LAST_24H: timedelta(hours=24),
    HistoryRange.LAST_7D: timedelta(days=7),
    HistoryRange.LAST_30D: timedelta(days=30),
    HistoryRange.ALL: None,
}


class LatestPriceProvider(Protocol):
    async def get_many(self, player_ids: Iterable[int]) -> dict[int, float]: ...


class PortfolioReader(Protocol):
    async def get_by_id(self, portfolio_id: int) -> tuple[int, float] | None: ...


def _since_for_range(now: datetime, range_: HistoryRange) -> datetime | None:
    delta = _RANGE_DELTAS[range_]
    return None if delta is None else now - delta


def _bucket_to_minute(ts: datetime) -> datetime:
    return ts.replace(second=0, microsecond=0)


@dataclass(frozen=True, slots=True)
class PortfolioHistoryService:
    portfolio_repo: PortfolioRepository
    snapshot_repo: PortfolioSnapshotRepository
    price_provider: LatestPriceProvider
    portfolio_reader: PortfolioReader
    # Injected so unit tests can freeze "now". Default lambda hits the
    # wall clock; production wiring overrides if needed.
    now_fn: object = datetime.now  # type: ignore[assignment]

    async def read(
        self,
        *,
        portfolio_id: int,
        range_: HistoryRange,
    ) -> list[PortfolioSnapshot]:
        now: datetime = self.now_fn(UTC) if callable(self.now_fn) else datetime.now(UTC)  # type: ignore[misc]
        since = _since_for_range(now, range_)
        history = await self.snapshot_repo.list_range(
            portfolio_id=portfolio_id, since=since, until=None
        )
        live = await self._compute_live_point(portfolio_id, now)
        if live is None:
            return history
        # If the latest persisted bucket matches the current minute,
        # the live point supersedes it (last-write-wins, same semantics
        # as the writer). Otherwise we append.
        current_bucket = _bucket_to_minute(now)
        if history and history[-1].ts == current_bucket:
            history[-1] = live
            return history
        history.append(live)
        return history

    async def _compute_live_point(
        self,
        portfolio_id: int,
        now: datetime,
    ) -> PortfolioSnapshot | None:
        info = await self.portfolio_reader.get_by_id(portfolio_id)
        if info is None:
            return None
        _, cash = info
        holdings = await self.portfolio_repo.list_holdings(portfolio_id)
        prices = (
            await self.price_provider.get_many([h.player_id for h in holdings])
            if holdings
            else {}
        )
        holdings_value = 0.0
        for h in holdings:
            price = prices.get(h.player_id, h.average_buy_price)
            holdings_value += h.shares * price
        value = cash + holdings_value
        open_value = await self.snapshot_repo.get_open_value(portfolio_id)
        pnl = 0.0 if open_value is None else value - open_value
        return PortfolioSnapshot(
            portfolio_id=portfolio_id,
            ts=_bucket_to_minute(now),
            cash=cash,
            holdings_value=holdings_value,
            value=value,
            pnl_vs_open=pnl,
        )
