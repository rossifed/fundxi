"""PortfolioSnapshot — bucketed portfolio value point.

DDD roles:
- ``PortfolioSnapshot``        : Value Object. Immutable record of a
                                 portfolio's value at the close of a
                                 1-minute bucket. Identity is
                                 ``(portfolio_id, ts)``.
- ``PortfolioSnapshotRepository``: Repository port. Write = upsert by
                                   bucket (last-write-wins inside the
                                   same minute). Read = range scan on
                                   ``(portfolio_id, ts)``.

Why a bucket = 1 minute:
- Display granularity for a chart of 120 points over ≥2 hours is
  already coarser than 1 min, so finer storage is invisible to the
  user and explodes write volume.
- One UPSERT per (portfolio, minute) collapses a tick storm
  (e.g. a goal cascading through L1 + L4 + L5 propagation) to a
  single row, regardless of how many ticks fired.

The bucket key is set by the caller (``date_trunc('minute', tick_ts)``)
so this layer stays free of clock dependencies — testable with a
fixed datetime.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True, slots=True)
class PortfolioSnapshot:
    portfolio_id: int
    ts: datetime  # caller-truncated to the minute bucket
    cash: float
    holdings_value: float
    value: float  # cash + holdings_value, persisted denormalised
    pnl_vs_open: float  # value − initial portfolio value


class PortfolioSnapshotRepository(Protocol):
    async def upsert(self, snapshot: PortfolioSnapshot) -> None: ...

    async def upsert_many(self, snapshots: list[PortfolioSnapshot]) -> None: ...

    async def list_range(
        self,
        *,
        portfolio_id: int,
        since: datetime | None,
        until: datetime | None,
    ) -> list[PortfolioSnapshot]: ...

    async def get_open_value(self, portfolio_id: int) -> float | None:
        """Return the earliest recorded ``value`` for this portfolio,
        used as the reference for ``pnl_vs_open``. ``None`` when no
        snapshot exists yet (caller should bootstrap an initial one)."""
        ...
