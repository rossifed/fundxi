"""Cleanup CLI: remove players from ``core.player`` who are not on the active
final-tournament squad of ``ACTIVE_SEASON_ID``.

DDD role: Adapter (driving). One-shot maintenance script. Idempotent —
safe to re-run any time; a no-op once converged.

Background
----------
Sportmonks' ``/squads/seasons/{season}/teams/{team}`` endpoint returns every
player ever registered for the team across the whole season (incl. pre-
tournament call-ups, withdrawals before the final cut). The active
26-man (or 23-man) tournament squad is the subset where
``has_values=true``. Before the bootstrap was filtering on that flag, we
ingested the broader pool — this script derives the canonical set from the
raw archive and drops the orphans.

Run with:
    uv run python -m src.infrastructure.workers.cleanup_non_tournament_players

Use ``--dry-run`` to print what would be deleted without touching the DB.
"""

import argparse
import asyncio
import logging
from collections.abc import Sequence

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.infrastructure.db.session import SessionLocal

log = structlog.get_logger(__name__)


def _configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(level=level.upper(), format="%(message)s")
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )


# Players who must stay: those that appear at least once with ``has_values=true``
# in an archived ``/squads/seasons/{season}/teams/{team}`` response.
_CANONICAL_SQL = text(
    """
    SELECT DISTINCT (item->>'player_id')::int AS sportmonks_player_id
    FROM raw.sportmonks_event,
         LATERAL jsonb_array_elements(response->'data') AS item
    WHERE endpoint LIKE '/squads/seasons/' || :season_id || '/teams/%'
      AND (item->>'has_values')::boolean = true
      AND (item->>'player_id') IS NOT NULL
    """
)

_EXTRAS_BREAKDOWN_SQL = text(
    """
    WITH canonical AS (
        SELECT DISTINCT (item->>'player_id')::int AS sportmonks_player_id
        FROM raw.sportmonks_event,
             LATERAL jsonb_array_elements(response->'data') AS item
        WHERE endpoint LIKE '/squads/seasons/' || :season_id || '/teams/%'
          AND (item->>'has_values')::boolean = true
          AND (item->>'player_id') IS NOT NULL
    ),
    extras AS (
        SELECT id FROM core.player
        WHERE sportmonks_id NOT IN (SELECT sportmonks_player_id FROM canonical)
    )
    SELECT
        (SELECT count(*) FROM extras) AS extras_count,
        (SELECT count(*) FROM core.player) AS total_before,
        (SELECT count(*) FROM core.lineup WHERE player_id IN (SELECT id FROM extras)) AS lineups_lost,
        (SELECT count(*) FROM core.match_event
            WHERE player_id IN (SELECT id FROM extras) OR related_player_id IN (SELECT id FROM extras)
        ) AS events_lost,
        (SELECT count(*) FROM core.match_comment_player_mention
            WHERE player_id IN (SELECT id FROM extras)) AS mentions_lost,
        (SELECT count(*) FROM core.player_tournament_stat WHERE player_id IN (SELECT id FROM extras)) AS stats_lost,
        (SELECT count(*) FROM valuation.player_price_tick WHERE player_id IN (SELECT id FROM extras)) AS ticks_lost,
        (SELECT count(*) FROM app.holding WHERE player_id IN (SELECT id FROM extras)) AS holdings_lost,
        (SELECT count(*) FROM app.trade WHERE player_id IN (SELECT id FROM extras)) AS trades_lost
    """
)

_AFFECTED_HOLDINGS_SQL = text(
    """
    WITH canonical AS (
        SELECT DISTINCT (item->>'player_id')::int AS sportmonks_player_id
        FROM raw.sportmonks_event,
             LATERAL jsonb_array_elements(response->'data') AS item
        WHERE endpoint LIKE '/squads/seasons/' || :season_id || '/teams/%'
          AND (item->>'has_values')::boolean = true
          AND (item->>'player_id') IS NOT NULL
    )
    SELECT h.portfolio_id, h.player_id, p.name, p.team_id, h.shares, h.average_buy_price
    FROM app.holding h
    JOIN core.player p ON p.id = h.player_id
    WHERE p.sportmonks_id NOT IN (SELECT sportmonks_player_id FROM canonical)
    """
)

_DELETE_SQL = text(
    """
    WITH canonical AS (
        SELECT DISTINCT (item->>'player_id')::int AS sportmonks_player_id
        FROM raw.sportmonks_event,
             LATERAL jsonb_array_elements(response->'data') AS item
        WHERE endpoint LIKE '/squads/seasons/' || :season_id || '/teams/%'
          AND (item->>'has_values')::boolean = true
          AND (item->>'player_id') IS NOT NULL
    )
    DELETE FROM core.player
    WHERE sportmonks_id NOT IN (SELECT sportmonks_player_id FROM canonical)
    """
)


async def _canonical_size(session: AsyncSession, *, season_id: int) -> int:
    rows: Sequence[int] = (await session.execute(_CANONICAL_SQL, {"season_id": str(season_id)})).scalars().all()
    return len(rows)


async def run(*, season_id: int, dry_run: bool) -> int:
    _configure_logging()
    log.info("cleanup.start", season_id=season_id, dry_run=dry_run)

    async with SessionLocal() as session:
        canonical_size = await _canonical_size(session, season_id=season_id)
        if canonical_size == 0:
            log.error(
                "cleanup.abort",
                reason=(
                    "canonical squad set is empty — either ACTIVE_SEASON_ID is wrong or the squads "
                    "endpoint has not been archived yet. Run bootstrap first."
                ),
                season_id=season_id,
            )
            return 2

        breakdown = (await session.execute(_EXTRAS_BREAKDOWN_SQL, {"season_id": str(season_id)})).mappings().one()
        log.info(
            "cleanup.scope",
            canonical_squad=canonical_size,
            extras=breakdown["extras_count"],
            total_before=breakdown["total_before"],
            cascade_lineups=breakdown["lineups_lost"],
            cascade_events=breakdown["events_lost"],
            cascade_mentions=breakdown["mentions_lost"],
            cascade_tournament_stats=breakdown["stats_lost"],
            cascade_price_ticks=breakdown["ticks_lost"],
            cascade_holdings=breakdown["holdings_lost"],
            cascade_trades=breakdown["trades_lost"],
        )

        if breakdown["lineups_lost"] != 0 or breakdown["events_lost"] != 0:
            log.error(
                "cleanup.abort",
                reason="extras intersect core.lineup or core.match_event — that means a non-canonical "
                "player actually played a tournament match, which contradicts has_values=true. "
                "Investigate before deleting.",
            )
            return 3

        if breakdown["holdings_lost"] or breakdown["trades_lost"]:
            rows = (await session.execute(_AFFECTED_HOLDINGS_SQL, {"season_id": str(season_id)})).mappings().all()
            for r in rows:
                log.warning(
                    "cleanup.holding_to_be_deleted",
                    portfolio_id=r["portfolio_id"],
                    player_id=r["player_id"],
                    name=r["name"],
                    team_id=r["team_id"],
                    shares=float(r["shares"]),
                    avg_buy_price=float(r["average_buy_price"]) if r["average_buy_price"] is not None else None,
                )

        if breakdown["extras_count"] == 0:
            log.info("cleanup.noop", reason="core.player already matches the canonical squad set")
            return 0

        if dry_run:
            log.info("cleanup.dry_run.skip_delete", would_delete=breakdown["extras_count"])
            return 0

        await session.execute(_DELETE_SQL, {"season_id": str(season_id)})
        await session.commit()
        log.info("cleanup.done", deleted=breakdown["extras_count"])
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Drop non-tournament players from core.player (Sportmonks has_values=true filter)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute the scope + cascade impact and the affected holdings; skip the actual DELETE.",
    )
    parser.add_argument(
        "--season-id",
        type=int,
        default=None,
        help="Override the season id (defaults to settings.active_season_id).",
    )
    args = parser.parse_args()
    settings = get_settings()
    season_id = args.season_id if args.season_id is not None else settings.active_season_id
    return asyncio.run(run(season_id=season_id, dry_run=args.dry_run))


if __name__ == "__main__":
    raise SystemExit(main())
