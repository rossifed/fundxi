"""Bootstrap CLI worker.

DDD role: Adapter (driving). Wires concrete repos + Sportmonks client + session
and invokes the bootstrap Use Case. Run via `uv run python -m src.infrastructure.workers.bootstrap`.

Configuration via environment / .env:
- DATABASE_URL           Postgres connection string
- SPORTMONKS_API_TOKEN   Bearer token for Sportmonks v3
- SPORTMONKS_BASE_URL    Defaults to https://api.sportmonks.com/v3/football
- ACTIVE_SEASON_ID       Sportmonks season_id of the tournament we ingest
                         (WC2022 during dev, WC2026 once the tournament starts)
"""

import asyncio
import logging
import sys
from datetime import date

import structlog

from src.application.bootstrap import BootstrapReport, bootstrap_for_season
from src.application.derive_team_colors import derive_team_colors
from src.config import get_settings
from src.infrastructure.db.repositories.coach import SqlAlchemyCoachRepository
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.news import SqlAlchemyNewsRepository
from src.infrastructure.db.repositories.player import SqlAlchemyPlayerRepository
from src.infrastructure.db.repositories.player_tournament_stat import (
    SqlAlchemyPlayerTournamentStatRepository,
)
from src.infrastructure.db.repositories.raw_sportmonks_event import SqlAlchemyRawSportmonksEventRepository
from src.infrastructure.db.repositories.team import SqlAlchemyTeamRepository
from src.infrastructure.db.session import SessionLocal
from src.infrastructure.sportmonks.client import HttpxSportmonksClient

log = structlog.get_logger(__name__)


def _configure_logging(level: str) -> None:
    logging.basicConfig(level=level.upper(), format="%(message)s")
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )


async def run() -> BootstrapReport:
    settings = get_settings()
    _configure_logging(settings.log_level)

    if not settings.sportmonks_api_token:
        raise SystemExit("SPORTMONKS_API_TOKEN not set in environment / .env")
    if settings.active_season_id <= 0:
        raise SystemExit("ACTIVE_SEASON_ID not set in environment / .env")

    log.info("bootstrap.start", season_id=settings.active_season_id)
    async with (
        HttpxSportmonksClient(
            base_url=settings.sportmonks_base_url, api_token=settings.sportmonks_api_token
        ) as client,
        SessionLocal() as session,
    ):
        report = await bootstrap_for_season(
            client=client,
            raw_archive=SqlAlchemyRawSportmonksEventRepository(session),
            team_repo=SqlAlchemyTeamRepository(session),
            coach_repo=SqlAlchemyCoachRepository(session),
            fixture_repo=SqlAlchemyFixtureRepository(session),
            player_repo=SqlAlchemyPlayerRepository(session),
            stat_repo=SqlAlchemyPlayerTournamentStatRepository(session),
            news_repo=SqlAlchemyNewsRepository(session),
            comment_repo=SqlAlchemyMatchCommentRepository(session),
            season_id=settings.active_season_id,
            today=date.today(),
        )
        # Derive team accent colours from the freshly-ingested kit palettes.
        await derive_team_colors(session)
        await session.commit()
    log.info(
        "bootstrap.done",
        teams=report.teams,
        fixtures=report.fixtures,
        players=report.players,
        news=report.news,
        comments=report.comments,
        player_stats=report.player_stats,
    )
    return report


def main() -> None:
    try:
        asyncio.run(run())
    except SystemExit as exc:
        print(f"bootstrap aborted: {exc}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
