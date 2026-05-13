"""CLI: replay a recorded fixture at controlled speed.

DDD role: Adapter (driving). Wires concrete adapters to the use case
and owns the session / transaction boundary.

Usage:
    uv run python -m src.simulation.cli.replay \\
        --fixture-id 18452325 \\
        --speed 60 \\
        [--from-minute 0]
"""

import argparse
import asyncio
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from types import TracebackType
from typing import Self

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.messaging import NotificationPublisher
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.match_event import SqlAlchemyMatchEventRepository
from src.infrastructure.db.session import SessionLocal
from src.infrastructure.messaging.nats_publisher import NatsPublisher
from src.simulation.application.replay_match import ReplayReport, replay_match
from src.simulation.domain.ports import LiveDataSink
from src.simulation.domain.price_state import PriceState
from src.simulation.domain.replay_event import ReplayEvent
from src.simulation.infrastructure.fixture_progress_sink import FixtureProgressSink
from src.simulation.infrastructure.fixture_status_publisher import publish_fixture_status
from src.simulation.infrastructure.nats_publishing_sink import NatsPublishingSink
from src.simulation.infrastructure.nats_publishing_tick_writer import NatsPublishingTickWriter
from src.simulation.infrastructure.pg_archive_reader import SqlAlchemyReplayArchiveReader
from src.simulation.infrastructure.pg_fixture_progress_writer import SqlAlchemyFixtureProgressWriter
from src.simulation.infrastructure.pg_price_tick_writer import SqlAlchemyPlayerPriceTickWriter
from src.simulation.infrastructure.price_tick_sink import PriceTickEmittingSink
from src.simulation.infrastructure.projector_sink import ProjectorSink
from src.simulation.infrastructure.replay_context import (
    acquire_replay_lock,
    ensure_fixture_idle,
    load_fixture_kickoff,
    load_initial_price_state,
    load_sportmonks_id_maps,
    release_replay_lock,
)

log = structlog.get_logger(__name__)

_DEFAULT_NATS_SERVERS = "nats://localhost:4222"


class _NullPublisher:
    """No-op publisher for ``--no-nats`` (offline DB-only replays).

    Async-context-manager shaped so the wiring can ``async with`` it
    interchangeably with ``NatsPublisher``."""

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
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


@dataclass(slots=True)
class _CliSink:
    """LiveDataSink wrapper that logs each emit and commits at every minute
    boundary so the app sees the data fill up progressively.

    DDD role: Adapter (driving-side decoration). Private to the CLI:
    real-time visibility is a wiring-layer concern, not domain.
    """

    inner: LiveDataSink
    session: AsyncSession
    _last_minute: int | None = None

    async def emit(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        if self._last_minute is not None and event.minute != self._last_minute:
            await self.session.commit()
        await self.inner.emit(event, fixture_internal_id=fixture_internal_id)
        log.info(
            "simulation.replay.emit",
            kind=event.kind.value,
            minute=event.minute,
            extra=event.extra_minute,
        )
        self._last_minute = event.minute


def _make_publisher(*, no_nats: bool) -> _NullPublisher | NatsPublisher:
    if no_nats:
        return _NullPublisher()
    servers = tuple(s.strip() for s in os.getenv("SIM_NATS_SERVERS", _DEFAULT_NATS_SERVERS).split(",") if s.strip())
    return NatsPublisher(servers=servers, name="fundxi-simulation")


async def run(*, fixture_sportmonks_id: int, speed: float, from_minute: int, no_nats: bool) -> ReplayReport:
    _configure_logging()
    log.info(
        "simulation.replay.start",
        fixture=fixture_sportmonks_id,
        speed=speed,
        from_minute=from_minute,
        nats=not no_nats,
    )
    async with SessionLocal() as session, _make_publisher(no_nats=no_nats) as publisher:
        await acquire_replay_lock(session)
        try:
            await ensure_fixture_idle(session, fixture_sportmonks_id=fixture_sportmonks_id)
            fixtures_repo = SqlAlchemyFixtureRepository(session)
            archive = SqlAlchemyReplayArchiveReader(session=session, fixtures=fixtures_repo)
            player_id_by_smk, team_id_by_smk = await load_sportmonks_id_maps(session)
            kickoff = await load_fixture_kickoff(session, fixture_sportmonks_id=fixture_sportmonks_id)
            price_state = await load_initial_price_state(session, as_of=kickoff)
            log.info(
                "simulation.replay.context_loaded",
                players=len(player_id_by_smk),
                teams=len(team_id_by_smk),
                kickoff=kickoff.isoformat(),
            )

            progress_writer = SqlAlchemyFixtureProgressWriter(session=session)
            sink = _CliSink(
                inner=_build_replay_sink(
                    session=session,
                    player_id_by_smk=player_id_by_smk,
                    team_id_by_smk=team_id_by_smk,
                    price_state=price_state,
                    kickoff=kickoff,
                    publisher=publisher,
                    progress_writer=progress_writer,
                ),
                session=session,
            )
            report = await replay_match(
                fixture_sportmonks_id=fixture_sportmonks_id,
                speed=speed,
                from_minute=from_minute,
                archive=archive,
                sink=sink,
                sleep=asyncio.sleep,
            )
            await progress_writer.finish(fixture_internal_id=report.fixture_internal_id)
            await session.commit()
            await publish_fixture_status(publisher, fixture_internal_id=report.fixture_internal_id, status="finished")
        finally:
            await release_replay_lock(session)
    log.info(
        "simulation.replay.done",
        fixture_internal_id=report.fixture_internal_id,
        minutes_played=report.minutes_played,
        events_emitted=report.events_emitted,
    )
    return report


def _build_replay_sink(
    *,
    session: AsyncSession,
    player_id_by_smk: dict[int, int],
    team_id_by_smk: dict[int, str],
    price_state: PriceState,
    kickoff: datetime,
    publisher: NotificationPublisher,
    progress_writer: SqlAlchemyFixtureProgressWriter,
) -> LiveDataSink:
    """Assemble the inner sink chain shared by the CLI and the Streamlit GUI:
    ProjectorSink → PriceTickEmittingSink → FixtureProgressSink → NatsPublishingSink.
    FixtureProgressSink sits *inside* NatsPublishingSink so the fixture row is
    updated before the per-event notification is published. The outermost
    decorator (commit-per-minute + logging/progress) is added by the caller."""
    projector_sink = ProjectorSink(
        comments=SqlAlchemyMatchCommentRepository(session),
        events=SqlAlchemyMatchEventRepository(session),
        player_id_by_sportmonks=player_id_by_smk,
        team_id_by_sportmonks=team_id_by_smk,
    )
    pricing_sink = PriceTickEmittingSink(
        inner=projector_sink,
        price_ticks=NatsPublishingTickWriter(
            inner=SqlAlchemyPlayerPriceTickWriter(session=session),
            publisher=publisher,
        ),
        price_state=price_state,
        fixture_kickoff=kickoff,
        player_id_by_sportmonks=player_id_by_smk,
        team_id_by_sportmonks=team_id_by_smk,
    )
    progress_sink = FixtureProgressSink(inner=pricing_sink, progress=progress_writer)
    return NatsPublishingSink(inner=progress_sink, publisher=publisher)


def main() -> int:
    parser = argparse.ArgumentParser(description="Replay a recorded fixture into the live store")
    parser.add_argument("--fixture-id", type=int, required=True, help="Sportmonks fixture id")
    parser.add_argument(
        "--speed",
        type=float,
        default=60.0,
        help="Acceleration factor: 1=real time, 60=1 game minute per real second (default: 60)",
    )
    parser.add_argument("--from-minute", type=int, default=0, help="Start replay at this minute (default: 0)")
    parser.add_argument(
        "--no-nats",
        action="store_true",
        help="Skip NATS publishing (offline DB-only replay).",
    )
    args = parser.parse_args()
    asyncio.run(
        run(
            fixture_sportmonks_id=args.fixture_id,
            speed=args.speed,
            from_minute=args.from_minute,
            no_nats=args.no_nats,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
