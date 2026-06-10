"""Worker: scrape Transfermarkt WC2026 squads into raw.transfermarkt_market_value.

DDD role: Adapter (driving). Wires the Transfermarkt client + parser + raw repo and
archives one snapshot. Re-runnable (upsert on tm_player_id). This is stage 1 of the
base-value seed; stage 2 (matching → core.player.base_value) is a separate worker.

Run:  uv run python -m src.infrastructure.workers.seed_transfermarkt
"""

import asyncio
import logging
import sys
from datetime import date

import httpx
import structlog

from src.infrastructure.db.repositories.transfermarkt_market_value import (
    SqlAlchemyTransfermarktMarketValueRepository,
    TransfermarktRow,
)
from src.infrastructure.db.session import SessionLocal
from src.infrastructure.transfermarkt.client import TransfermarktClient
from src.infrastructure.transfermarkt.scraper import parse_squad, parse_team_links

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
    _configure_logging()
    snapshot_date = date.today()
    total = 0

    async with TransfermarktClient() as client, SessionLocal() as session:
        repo = SqlAlchemyTransfermarktMarketValueRepository(session)

        index_html = await client.fetch_index()
        teams = parse_team_links(index_html)
        log.info("transfermarkt.index.done", teams=len(teams))

        for team in teams:
            try:
                team_html = await client.fetch_team(team.slug, team.verein_id)
            except httpx.HTTPError as exc:
                log.warning("transfermarkt.team.fetch_failed", team=team.slug, reason=str(exc))
                continue
            players = parse_squad(team_html)
            rows = [
                TransfermarktRow(
                    tm_player_id=p.tm_id,
                    player_slug=p.slug,
                    player_name=p.name,
                    team_slug=team.slug,
                    team_name=team.name,
                    team_verein_id=team.verein_id,
                    market_value_m=p.market_value_m,
                    snapshot_date=snapshot_date,
                )
                for p in players
            ]
            written = await repo.upsert_many(rows)
            total += written
            log.info("transfermarkt.team.done", team=team.slug, players=written)

        await session.commit()

    log.info("transfermarkt.seed.done", players=total, snapshot_date=snapshot_date.isoformat())
    return total


def main() -> None:
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        print("seed aborted", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
