"""One-shot worker: seed the first portfolio_value_snapshot for every
existing portfolio that doesn't have one yet.

Why this exists: the snapshot table was introduced in migration 0023.
Portfolios that existed BEFORE the table need an opening row so the
chart has a baseline (and ``pnl_vs_open`` is well-defined for the live
tail stitching in ``PortfolioHistoryService``).

For each such portfolio we materialise a snapshot reflecting its
CURRENT state (cash + Σ shares × latest_tick_price). That becomes the
"open" baseline going forward — i.e. the chart starts from "now".

Idempotent. Run multiple times safely (``UPSERT`` semantics; we skip
portfolios that already have ≥1 row).

Run via:
    uv run python -m src.infrastructure.workers.bootstrap_portfolio_snapshots
"""

import asyncio
import logging
from datetime import UTC, datetime

import structlog
from sqlalchemy import select

from src.application.portfolio_snapshot_service import PortfolioSnapshotService
from src.infrastructure.db.models.portfolio import HoldingORM, PortfolioORM
from src.infrastructure.db.models.portfolio_value_snapshot import PortfolioValueSnapshotORM
from src.infrastructure.db.session import SessionLocal

log = structlog.get_logger(__name__)


def _configure_logging() -> None:
    logging.basicConfig(level="INFO", format="%(message)s")
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )


async def run() -> int:
    """Returns the count of portfolios newly seeded."""
    seeded = 0
    async with SessionLocal() as session:
        all_pids = (await session.execute(select(PortfolioORM.id))).scalars().all()
        existing = set(
            (await session.execute(select(PortfolioValueSnapshotORM.portfolio_id).distinct()))
            .scalars()
            .all()
        )
        missing = [pid for pid in all_pids if pid not in existing]
        if not missing:
            log.info("bootstrap_portfolio_snapshots.no_missing")
            return 0

        service = PortfolioSnapshotService.from_session(session)
        ts = datetime.now(UTC)
        for pid in missing:
            # Use any player_id the portfolio holds so the dirty-resolver
            # picks this portfolio. If the portfolio is empty we still
            # want a snapshot → fall back to the bootstrap path.
            held_players = (
                await session.execute(
                    select(HoldingORM.player_id).where(HoldingORM.portfolio_id == pid)
                )
            ).scalars().all()
            if held_players:
                await service.materialize_for_player_ticks(
                    ticked_player_ids=list(held_players),
                    ts=ts,
                )
            else:
                await service.bootstrap(pid, opened_at=ts)
            seeded += 1
            log.info("bootstrap_portfolio_snapshots.seeded", portfolio_id=pid)
        await session.commit()
    log.info("bootstrap_portfolio_snapshots.done", seeded=seeded)
    return seeded


def main() -> None:
    _configure_logging()
    asyncio.run(run())


if __name__ == "__main__":
    main()
