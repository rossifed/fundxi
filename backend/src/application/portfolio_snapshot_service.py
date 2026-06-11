"""PortfolioSnapshotService — bucketed materialisation of portfolio value.

Includes a session-bound convenience builder ``materialize_after_ticks``
that wires the concrete SQL adapters and invokes the service in one
call — meant to be the single line a price-tick writer adds at the end
of its batch.

DDD role: Application Service. Orchestrates the recomputation of a
``PortfolioSnapshot`` for every portfolio that holds at least one of
the players whose price just ticked.

Wired into the price-tick emission path: after a batch of ticks lands,
the pricing sink hands the set of affected player_ids + the batch
timestamp to ``materialize_for_player_ticks``.
The service:

1. Finds the *dirty* portfolios = those holding any of the ticked
   players (``LatestPriceProvider`` + ``DirtyPortfolioResolver``).
2. For each dirty portfolio, rebuilds (cash, holdings_value) using
   the latest price of every held player at ``ts``.
3. Upserts one row per (portfolio_id, minute(ts)) into
   ``valuation.portfolio_value_snapshot``.

Properties:
- Idempotent: re-running the same batch overwrites the same bucket
  with the same value (UPSERT, deterministic inputs).
- Tick-storm safe: 50 ticks in the same minute → 1 row.
- Pure-ish: I/O delegated to repository ports; the price/cash math
  is local to keep the unit tests fast and fake-friendly.

Pricing ladder: each position is marked at ``tick ?? base ?? cost-basis``.
The wired ``price_provider`` (``SqlAlchemyCurrentPriceProvider``) already
resolves an un-ticked player to its starting price (``base_value``) — the
SAME ``tick ?? base`` rule the frontend's valuation surface uses — so the
snapshot marks each holding at the exact price the UI shows. The pure
helper's final fall back to ``average_buy_price`` is a last-resort safety
net (a price provider that returns nothing for a player), unreachable for a
tradeable player but kept so the snapshot never silently drops a position.
The moment a real tick lands the snapshot self-corrects.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Protocol

from src.domain.portfolio.portfolio import Holding, PortfolioRepository
from src.domain.portfolio.portfolio_snapshot import (
    PortfolioSnapshot,
    PortfolioSnapshotRepository,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class DirtyPortfolioResolver(Protocol):
    async def find_holders_of(self, player_ids: Iterable[int]) -> list[int]:
        """Return portfolio_ids that hold ≥1 of the given players."""
        ...


class LatestPriceProvider(Protocol):
    async def get_many(self, player_ids: Iterable[int]) -> dict[int, float]:
        """Latest known price per player_id. Missing keys → never ticked."""
        ...


class PortfolioReader(Protocol):
    async def get_by_id(self, portfolio_id: int) -> tuple[int, float] | None:
        """Return ``(portfolio_id, cash)`` or ``None`` if unknown."""
        ...


def _bucket_to_minute(ts: datetime) -> datetime:
    """Truncate to minute precision — matches the snapshot bucket key.

    Pure function, deterministic — testable with literal datetimes."""
    return ts.replace(second=0, microsecond=0)


def _compute_holdings_value(
    holdings: list[Holding],
    prices: dict[int, float],
) -> float:
    """Sum of shares * latest_price across positions. Falls back to the
    holding's own cost basis (``average_buy_price``) when no tick exists
    yet - see service docstring."""
    total = 0.0
    for h in holdings:
        price = prices.get(h.player_id, h.average_buy_price)
        total += h.shares * price
    return total


@dataclass(frozen=True, slots=True)
class PortfolioSnapshotService:
    portfolio_repo: PortfolioRepository
    snapshot_repo: PortfolioSnapshotRepository
    dirty_resolver: DirtyPortfolioResolver
    price_provider: LatestPriceProvider
    portfolio_reader: PortfolioReader

    async def materialize_for_player_ticks(
        self,
        *,
        ticked_player_ids: Iterable[int],
        ts: datetime,
    ) -> int:
        """Materialise snapshots for every portfolio holding any of the
        ticked players. Returns the number of snapshots written.

        ``ts`` MUST be wall-clock time — a portfolio's value history
        lives on the user's real timeline. Callers driven by a replay
        must pass ``datetime.now(UTC)``, NOT the match's simulated
        (fixture-kickoff-derived) timestamp."""
        player_ids = list({pid for pid in ticked_player_ids})
        if not player_ids:
            return 0

        dirty = await self.dirty_resolver.find_holders_of(player_ids)
        if not dirty:
            return 0

        bucket_ts = _bucket_to_minute(ts)
        snapshots = await self._build_snapshots(dirty, bucket_ts)
        if snapshots:
            await self.snapshot_repo.upsert_many(snapshots)
        return len(snapshots)

    async def bootstrap(self, portfolio_id: int, *, opened_at: datetime) -> None:
        """Write the initial snapshot for a freshly-created portfolio.

        Called once at portfolio creation — establishes the
        ``pnl_vs_open`` baseline that subsequent snapshots reference."""
        info = await self.portfolio_reader.get_by_id(portfolio_id)
        if info is None:
            return
        _, cash = info
        holdings = await self.portfolio_repo.list_holdings(portfolio_id)
        # At bootstrap there should be no holdings, but the formula is
        # safe regardless — supports the rare case of replaying a snapshot
        # for a pre-existing portfolio.
        prices: dict[int, float] = {}
        if holdings:
            prices = await self.price_provider.get_many([h.player_id for h in holdings])
        holdings_value = _compute_holdings_value(holdings, prices)
        value = cash + holdings_value
        snapshot = PortfolioSnapshot(
            portfolio_id=portfolio_id,
            ts=_bucket_to_minute(opened_at),
            cash=cash,
            holdings_value=holdings_value,
            value=value,
            pnl_vs_open=0.0,
        )
        await self.snapshot_repo.upsert(snapshot)

    @classmethod
    def from_session(cls, session: "AsyncSession") -> "PortfolioSnapshotService":
        # Local imports to keep the domain/application layer free of
        # infrastructure imports at module load time.
        from src.infrastructure.db.repositories.portfolio import (
            SqlAlchemyPortfolioRepository,
        )
        from src.infrastructure.db.repositories.portfolio_snapshot import (
            SqlAlchemyPortfolioSnapshotRepository,
        )
        from src.infrastructure.db.repositories.portfolio_snapshot_adapters import (
            SqlAlchemyCurrentPriceProvider,
            SqlAlchemyDirtyPortfolioResolver,
            SqlAlchemyPortfolioReader,
        )

        return cls(
            portfolio_repo=SqlAlchemyPortfolioRepository(session),
            snapshot_repo=SqlAlchemyPortfolioSnapshotRepository(session),
            dirty_resolver=SqlAlchemyDirtyPortfolioResolver(session),
            # tick ?? base — marks positions at the same price the UI shows, so
            # the value snapshot aligns with the frontend totals by construction.
            price_provider=SqlAlchemyCurrentPriceProvider(session, as_of=datetime.now(UTC)),
            portfolio_reader=SqlAlchemyPortfolioReader(session),
        )

    async def _build_snapshots(
        self,
        portfolio_ids: list[int],
        bucket_ts: datetime,
    ) -> list[PortfolioSnapshot]:
        out: list[PortfolioSnapshot] = []
        for pid in portfolio_ids:
            info = await self.portfolio_reader.get_by_id(pid)
            if info is None:
                continue
            _, cash = info
            holdings = await self.portfolio_repo.list_holdings(pid)
            prices = (
                await self.price_provider.get_many([h.player_id for h in holdings])
                if holdings
                else {}
            )
            holdings_value = _compute_holdings_value(holdings, prices)
            value = cash + holdings_value
            open_value = await self.snapshot_repo.get_open_value(pid)
            pnl = 0.0 if open_value is None else value - open_value
            out.append(
                PortfolioSnapshot(
                    portfolio_id=pid,
                    ts=bucket_ts,
                    cash=cash,
                    holdings_value=holdings_value,
                    value=value,
                    pnl_vs_open=pnl,
                )
            )
        return out
