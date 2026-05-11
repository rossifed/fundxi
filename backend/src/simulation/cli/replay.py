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
from dataclasses import dataclass

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.models.team import TeamORM
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.match_event import SqlAlchemyMatchEventRepository
from src.infrastructure.db.session import SessionLocal
from src.simulation.application.replay_match import ReplayReport, replay_match
from src.simulation.domain.replay_event import ReplayEvent
from src.simulation.infrastructure.pg_archive_reader import SqlAlchemyReplayArchiveReader
from src.simulation.infrastructure.projector_sink import ProjectorSink

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


@dataclass(slots=True)
class _CliSink:
    """LiveDataSink wrapper that logs each emit and commits at every minute
    boundary so the app sees the data fill up progressively.

    DDD role: Adapter (driving-side decoration). Private to the CLI:
    real-time visibility is a wiring-layer concern, not domain.
    """

    inner: ProjectorSink
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


async def _load_sportmonks_id_maps(session: AsyncSession) -> tuple[dict[int, int], dict[int, str]]:
    """Snapshot ``sportmonks_id → internal_id`` for players and teams.

    These are needed by the match-event projector. Loaded once per
    replay run; the simulation context never adds players or teams at
    runtime, so a snapshot is sufficient.
    """
    players = (
        await session.execute(
            select(PlayerORM.id, PlayerORM.sportmonks_id).where(PlayerORM.sportmonks_id.is_not(None))
        )
    ).all()
    player_id_by_smk: dict[int, int] = {
        row.sportmonks_id: row.id for row in players if row.sportmonks_id is not None
    }
    teams = (
        await session.execute(
            select(TeamORM.id, TeamORM.sportmonks_id).where(TeamORM.sportmonks_id.is_not(None))
        )
    ).all()
    team_id_by_smk: dict[int, str] = {
        row.sportmonks_id: row.id for row in teams if row.sportmonks_id is not None
    }
    return player_id_by_smk, team_id_by_smk


async def run(*, fixture_sportmonks_id: int, speed: float, from_minute: int) -> ReplayReport:
    _configure_logging()
    log.info(
        "simulation.replay.start",
        fixture=fixture_sportmonks_id,
        speed=speed,
        from_minute=from_minute,
    )
    async with SessionLocal() as session:
        fixtures = SqlAlchemyFixtureRepository(session)
        archive = SqlAlchemyReplayArchiveReader(session=session, fixtures=fixtures)
        player_id_by_smk, team_id_by_smk = await _load_sportmonks_id_maps(session)
        log.info(
            "simulation.replay.maps_loaded",
            players=len(player_id_by_smk),
            teams=len(team_id_by_smk),
        )
        sink = _CliSink(
            inner=ProjectorSink(
                comments=SqlAlchemyMatchCommentRepository(session),
                events=SqlAlchemyMatchEventRepository(session),
                player_id_by_sportmonks=player_id_by_smk,
                team_id_by_sportmonks=team_id_by_smk,
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
        await session.commit()
    log.info(
        "simulation.replay.done",
        fixture_internal_id=report.fixture_internal_id,
        minutes_played=report.minutes_played,
        events_emitted=report.events_emitted,
    )
    return report


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
    args = parser.parse_args()
    asyncio.run(run(fixture_sportmonks_id=args.fixture_id, speed=args.speed, from_minute=args.from_minute))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
