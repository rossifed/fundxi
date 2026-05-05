"""Enrichment worker — populate core.match_comment_player_mention.

DDD role: Adapter (driving). Iterates every comment, scopes the candidate
players to the comment's fixture squads, runs the pure mention extractor,
and bulk-inserts the resulting links. Idempotent on (comment_id, player_id).

Run via:
    uv run python -m src.infrastructure.workers.enrich_player_mentions
"""

import asyncio
import logging
from collections import defaultdict

import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from src.application.player_mention import extract_mentioned_player_ids
from src.domain.player.player import Player, Position
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.match_comment import MatchCommentORM
from src.infrastructure.db.models.match_comment_player_mention import MatchCommentPlayerMentionORM
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.session import SessionLocal

log = structlog.get_logger(__name__)


def _orm_to_player(orm: PlayerORM) -> Player:
    return Player(
        id=orm.id,
        name=orm.name,
        jersey_number=orm.jersey_number,
        team_id=orm.team_id,
        position=Position(orm.position),
        full_name=orm.full_name,
    )


def _configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )


async def run() -> tuple[int, int]:
    """Returns (comments_processed, mentions_inserted)."""
    _configure_logging()
    async with SessionLocal() as session:
        # Pre-load fixtures: id → (home_team_id, away_team_id)
        fixtures_result = await session.execute(
            select(FixtureORM.id, FixtureORM.home_team_id, FixtureORM.away_team_id)
        )
        fixtures = fixtures_result.all()
        teams_by_fixture: dict[int, tuple[str, str]] = {f.id: (f.home_team_id, f.away_team_id) for f in fixtures}

        # Pre-load players grouped by team_id.
        players_by_team: dict[str, list[Player]] = defaultdict(list)
        all_players = (await session.execute(select(PlayerORM))).scalars().all()
        for orm in all_players:
            players_by_team[orm.team_id].append(_orm_to_player(orm))

        log.info(
            "enrich_player_mentions.preloaded",
            fixtures=len(teams_by_fixture),
            players=sum(len(v) for v in players_by_team.values()),
        )

        # Stream all comments.
        comments = (
            await session.execute(select(MatchCommentORM.id, MatchCommentORM.fixture_id, MatchCommentORM.comment))
        ).all()
        log.info("enrich_player_mentions.comments_loaded", n=len(comments))

        rows: list[dict[str, int]] = []
        for comment_id, fixture_id, text in comments:
            teams = teams_by_fixture.get(fixture_id)
            if not teams:
                continue
            candidates = players_by_team.get(teams[0], []) + players_by_team.get(teams[1], [])
            if not candidates:
                continue
            for player_id in extract_mentioned_player_ids(text, candidates):
                rows.append({"match_comment_id": comment_id, "player_id": player_id})

        log.info("enrich_player_mentions.candidate_links", n=len(rows))

        # Bulk insert in chunks; idempotent via ON CONFLICT DO NOTHING.
        inserted = 0
        chunk = 5000
        for i in range(0, len(rows), chunk):
            batch = rows[i : i + chunk]
            if not batch:
                continue
            stmt = pg_insert(MatchCommentPlayerMentionORM).values(batch).on_conflict_do_nothing()
            await session.execute(stmt)
            inserted += len(batch)
        await session.commit()

    log.info("enrich_player_mentions.done", comments=len(comments), mentions=inserted)
    return len(comments), inserted


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
