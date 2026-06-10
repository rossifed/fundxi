"""Worker (prod): seed the pre-tournament baseline price tick from base_value.

DDD role: Adapter (driving). Writes one anchor tick per seeded player into
``valuation.player_price_tick`` at the WC2026 open (earliest season kickoff minus a
day), ``fixture_id IS NULL``, ``current_price = core.player.base_value`` (a flat 0% anchor;
the read model derives every % from prices, so no stored delta is needed).

Why: the read model and the screener anchor the "% since inception" on the per-player
``fixture_id IS NULL`` tick (else the FIRST in-match tick is mistaken for the anchor
and the total is understated). Seeding it from the real Transfermarkt ``base_value``
makes the whole coherence chain (price, per-match, total) derive from the real t0 by
construction. Players WITHOUT a base value get no baseline tick (unpriceable).

Anchor ts is SEASON-SCOPED (earliest 26618 kickoff minus 1 day), NOT the global-earliest
kickoff: a prod DB may also hold WC2022 fixtures, whose 2022 kickoff would wrongly
anchor the WC2026 series in the past.

Idempotent (``ON CONFLICT (player_id, ts) DO NOTHING``). Run AFTER the base_value
seed and the fixtures load, once, before the opener.

Run:  WC2026_SEASON_ID=26618 uv run python -m src.infrastructure.workers.seed_baseline_price_ticks
"""

import asyncio
import logging
import os
from datetime import timedelta

import structlog
from sqlalchemy import select

from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.price_tick_writer import price_tick_row, upsert_price_ticks
from src.infrastructure.db.session import SessionLocal

log = structlog.get_logger(__name__)

# Neutral pre-match rating on the baseline tick (matches the simulation seeder); the
# tick carries a 0% move, so the rating is not a price signal.
_NEUTRAL_RATING = 6.5


async def run() -> None:
    logging.basicConfig(level="INFO", format="%(message)s")
    structlog.configure(processors=[structlog.processors.add_log_level, structlog.dev.ConsoleRenderer()])
    season_id = int(os.environ.get("WC2026_SEASON_ID", "26618"))

    async with SessionLocal() as session:
        earliest = (
            await session.execute(
                select(FixtureORM.kickoff_at)
                .where(FixtureORM.season_id == season_id, FixtureORM.kickoff_at.is_not(None))
                .order_by(FixtureORM.kickoff_at)
                .limit(1)
            )
        ).scalar_one_or_none()
        if earliest is None:
            log.warning("baseline.no_fixtures", season_id=season_id)
            return
        anchor_ts = earliest - timedelta(days=1)

        seeded = (
            await session.execute(select(PlayerORM.id, PlayerORM.base_value).where(PlayerORM.base_value.is_not(None)))
        ).all()
        rows = [
            price_tick_row(
                player_id=row.id,
                ts=anchor_ts,
                fixture_id=None,
                current_price=round(float(row.base_value), 2),
                performance_rating=_NEUTRAL_RATING,
                source="engine",
            )
            for row in seeded
        ]
        written = await upsert_price_ticks(session, rows)
        await session.commit()

    log.info("baseline.seed.done", players=len(rows), submitted=written, anchor_ts=anchor_ts.isoformat())


if __name__ == "__main__":
    asyncio.run(run())
