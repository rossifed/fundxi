"""Worker: match scraped Transfermarkt values onto core.player.base_value.

DDD role: Adapter (driving). Stage 2 of the base-value seed. Reads our WC2026
players + the raw TM archive, runs the pure matcher, and writes the anchor
(``base_value`` + ``base_value_source='transfermarkt'``) for every confident match.
Unmatched players keep ``base_value = NULL`` → the UI shows "—" (never synthetic in
prod). Re-runnable: a re-run simply re-writes the same anchors.

Run:  WC2026_SEASON_ID=26618 uv run python -m src.infrastructure.workers.seed_base_value
"""

import asyncio
import logging
import os
import sys

import structlog
from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.base_value_seed import OurPlayer, TmPlayer, match_players
from src.infrastructure.db.session import SessionLocal

log = structlog.get_logger(__name__)

_SOURCE = "transfermarkt"


def _configure_logging() -> None:
    logging.basicConfig(level="INFO", format="%(message)s")
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )


async def _load_our_players(session: AsyncSession, season_id: int) -> list[OurPlayer]:
    rows = await session.execute(
        text(
            """
            SELECT p.id, p.name, t.name AS team_name
            FROM core.player p
            JOIN core.team t ON t.id = p.team_id
            WHERE t.id IN (
                SELECT home_team_id FROM core.fixture WHERE season_id = :season_id
                UNION
                SELECT away_team_id FROM core.fixture WHERE season_id = :season_id
            )
            """
        ),
        {"season_id": season_id},
    )
    return [OurPlayer(player_id=r.id, name=r.name, team_name=r.team_name) for r in rows]


async def _load_tm_players(session: AsyncSession) -> list[TmPlayer]:
    rows = await session.execute(
        text(
            """
            SELECT tm_player_id, player_name, market_value_m, team_name
            FROM raw.transfermarkt_market_value
            """
        )
    )
    return [
        TmPlayer(tm_id=r.tm_player_id, name=r.player_name, market_value_m=r.market_value_m, team_name=r.team_name)
        for r in rows
    ]


async def run() -> None:
    _configure_logging()
    season_id = int(os.environ.get("WC2026_SEASON_ID", "26618"))

    async with SessionLocal() as session:
        our_players = await _load_our_players(session, season_id)
        tm_players = await _load_tm_players(session)
        log.info("base_value.loaded", our_players=len(our_players), tm_players=len(tm_players))

        result = match_players(our_players, tm_players)

        if result.matched:
            await session.execute(
                text(
                    """
                    UPDATE core.player
                    SET base_value = :market_value_m, base_value_source = :source
                    WHERE id = :player_id
                    """
                ).bindparams(bindparam("source")),
                [
                    {"player_id": m.player_id, "market_value_m": m.market_value_m, "source": _SOURCE}
                    for m in result.matched
                ],
            )
        await session.commit()

    log.info(
        "base_value.seed.done",
        matched=len(result.matched),
        unmatched_players=len(result.unmatched_players),
        unmatched_teams=sorted(set(result.unmatched_teams)),
    )


def main() -> None:
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        print("seed aborted", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
