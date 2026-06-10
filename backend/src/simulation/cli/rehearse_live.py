"""CLI: live-plumbing REHEARSAL — synthetic rating, real pipeline.

DDD role: Adapter (driving). On-demand ONLY (never the scheduled
daemon). Drives the EXACT live path — same canonical kernel, same
``valuation.player_price_tick`` rows, same NATS subjects, same SSE →
the app's price flashes — so the 10s poll → rating → price → UI
behaviour can be SEEN before a real match exists.

NOT real data. The rating is fabricated by ``synthetic_rating`` (only
the timing of archived events is real). Every tick is tagged
``source = "rehearsal"`` so it is filterable and can never be mistaken
for engine output. Tracked as a debt in the project memory file.

Run:
    uv run python -m src.simulation.cli.rehearse_live \\
        --fixture-id 18452325 --interval 10 --minutes 95
"""

import argparse
import asyncio
import logging
import os
from datetime import UTC, datetime
from random import Random
from types import TracebackType
from typing import Self

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.valuation.player_valuation import ValuationSource
from src.infrastructure.db.price_tick_writer import upsert_price_tick
from src.infrastructure.db.session import SessionLocal
from src.infrastructure.messaging.nats_publisher import NatsPublisher
from src.simulation.domain.synthetic_rating import event_bump, next_rating
from src.simulation.infrastructure.fixture_status_publisher import publish_fixture_status
from src.simulation.infrastructure.replay_context import load_fixture_rosters, load_initial_price_state
from src.valuation.pricing import PriceSnapshot
from src.valuation.pricing import price as kernel_price

log = structlog.get_logger(__name__)
_DEFAULT_NATS = "nats://localhost:4222"


class _NullPublisher:
    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self, et: type[BaseException] | None, e: BaseException | None, tb: TracebackType | None
    ) -> None:
        return None

    async def publish(self, subject: str, payload: bytes) -> None:
        return None


def _configure_logging() -> None:
    logging.basicConfig(level="INFO", format="%(message)s")
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )


async def _fixture_internal_id(session: AsyncSession, smk_id: int) -> int:
    row = await session.execute(text("SELECT id FROM core.fixture WHERE sportmonks_id = :s"), {"s": smk_id})
    fid = row.scalar_one_or_none()
    if fid is None:
        raise SystemExit(f"fixture sportmonks_id={smk_id} not found in core.fixture")
    return int(fid)


async def _events_by_minute(session: AsyncSession, fixture_id: int) -> dict[int, list[tuple[int, str]]]:
    rows = await session.execute(
        text("SELECT minute, type, player_id FROM core.match_event WHERE fixture_id = :f AND player_id IS NOT NULL"),
        {"f": fixture_id},
    )
    out: dict[int, list[tuple[int, str]]] = {}
    for minute, etype, pid in rows.all():
        out.setdefault(int(minute), []).append((int(pid), str(etype)))
    return out


async def _set_status(session: AsyncSession, fixture_id: int, status: str) -> None:
    await session.execute(text("UPDATE core.fixture SET status = :st WHERE id = :f"), {"st": status, "f": fixture_id})
    await session.commit()


async def run(*, fixture_smk_id: int, interval: float, minutes: int, seed: int, no_nats: bool) -> None:
    _configure_logging()
    log.warning("rehearsal.start.SIMULATED", fixture=fixture_smk_id, interval=interval, minutes=minutes)
    publisher: _NullPublisher | NatsPublisher = (
        _NullPublisher()
        if no_nats
        else NatsPublisher(
            servers=tuple(os.getenv("SIM_NATS_SERVERS", _DEFAULT_NATS).split(",")), name="fundxi-rehearsal"
        )
    )
    async with SessionLocal() as session, publisher as pub:
        fixture_id = await _fixture_internal_id(session, fixture_smk_id)
        rosters = await load_fixture_rosters(session, fixture_sportmonks_id=fixture_smk_id)
        prices = await load_initial_price_state(session, as_of=datetime.now(UTC))
        events = await _events_by_minute(session, fixture_id)
        roster = [(pid, pos) for players in rosters.by_team.values() for pid, pos in players]
        if not roster:
            raise SystemExit(f"fixture {fixture_smk_id} has no lineup — bootstrap it first")

        rng = Random(seed)
        rating: dict[int, float] = {pid: 6.0 for pid, _ in roster}
        await _set_status(session, fixture_id, "live")
        await publish_fixture_status(pub, fixture_internal_id=fixture_id, status="live")

        try:
            for minute in range(1, minutes + 1):
                bumps: dict[int, float] = {}
                for pid, etype in events.get(minute, []):
                    bumps[pid] = bumps.get(pid, 0.0) + event_bump(etype)
                ts = datetime.now(UTC)
                ticks = 0
                for pid, _pos in roster:
                    base = prices.current(pid)
                    if base is None:
                        continue
                    rating[pid] = next_rating(rating[pid], rng=rng, bump=bumps.get(pid, 0.0))
                    snap = PriceSnapshot(rating=rating[pid], is_live=True)
                    result = kernel_price(base, 0.0, snap)
                    await upsert_price_tick(
                        session,
                        player_id=pid,
                        ts=ts,
                        fixture_id=fixture_id,
                        current_price=result.price,
                        performance_rating=round(rating[pid], 2),
                        change_since_open=round(result.live_delta * 100.0, 2),
                        source=ValuationSource.REHEARSAL.value,
                    )
                    payload = (
                        f'{{"kind":"player_price_tick","player_id":{pid},'
                        f'"fixture_id":{fixture_id},"current_price":{result.price},'
                        f'"change_since_open":{round(result.live_delta * 100.0, 2)}}}'
                    ).encode()
                    try:
                        await pub.publish(f"fundxi.player_price_tick.{pid}", payload)
                    except Exception as exc:
                        log.debug("rehearsal.publish_failed", error=str(exc))
                    ticks += 1
                # Materialise portfolio snapshots in the same transaction
                # as the ticks: every holder of any priced player in this
                # minute gets a fresh bucket. Same session ⇒ atomic with
                # the tick write (cf. portfolio-history design memo).
                from src.application.portfolio_snapshot_service import PortfolioSnapshotService
                pvs_service = PortfolioSnapshotService.from_session(session)
                await pvs_service.materialize_for_player_ticks(
                    ticked_player_ids=[pid for pid, _pos in roster],
                    ts=ts,
                )
                await session.commit()
                log.info("rehearsal.minute.SIMULATED", minute=minute, ticks=ticks)
                await asyncio.sleep(interval)
        finally:
            await _set_status(session, fixture_id, "finished")
            await publish_fixture_status(pub, fixture_internal_id=fixture_id, status="finished")
    log.warning("rehearsal.done.SIMULATED", fixture=fixture_smk_id)


def main() -> None:
    p = argparse.ArgumentParser(description="Live-plumbing REHEARSAL (synthetic rating — NOT real data)")
    p.add_argument("--fixture-id", type=int, required=True, help="Sportmonks fixture id")
    p.add_argument("--interval", type=float, default=10.0, help="Real seconds between ticks (default 10)")
    p.add_argument("--minutes", type=int, default=95, help="Simulated match minutes (default 95)")
    p.add_argument("--seed", type=int, default=1337, help="RNG seed (reproducible)")
    p.add_argument("--no-nats", action="store_true", help="DB only, no bus")
    a = p.parse_args()
    asyncio.run(
        run(
            fixture_smk_id=a.fixture_id,
            interval=a.interval,
            minutes=a.minutes,
            seed=a.seed,
            no_nats=a.no_nats,
        )
    )


if __name__ == "__main__":
    main()
