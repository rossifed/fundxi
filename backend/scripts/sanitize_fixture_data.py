"""Sanitize per-fixture player data against the now-final Sportmonks payloads.

DDD role: Adapter (driving) — a manual operational entry point.

For each target fixture it re-fetches the fixture payload once and:
  1. full-set syncs ``core.match_event`` (``sync_fixture_events``): prunes the
     duplicates and phantoms an upsert-only live capture accumulated
     (provisional events replaced under new ids, VAR-rescinded events);
  2. clears the ``is_goal`` commentary flag of VAR-disallowed goals
     (``reconcile_var_disallowed_goals``);
  3. re-projects ``core.player_match_stat`` from ``lineups.details`` (picks up
     projector fixes, e.g. yellow-red cards counting as red).

Unlike ``recover_fixture.py`` it does NOT price or settle anything, so it is
SAFE on already-settled fixtures — it touches only the data projections.
Idempotent; commits per fixture (checkpointed).

Optionally (``--refresh-tournament-stats``) it re-pulls the season-aggregate
``core.player_tournament_stat`` for every team of the season (one squad call
per team), so the aggregates are re-projected with the fixed mapping without
waiting for the daily ReferenceRefresher.

Usage (DATABASE_URL must point at the TARGET database):
    DATABASE_URL=postgresql+asyncpg://...  APP_ENV=dev  PYTHONPATH=. \\
        uv run python -m scripts.sanitize_fixture_data --all-finished
    ... --all-finished --refresh-tournament-stats
    ... <sportmonks_fixture_id> [<sportmonks_fixture_id> ...]
"""

import asyncio
import sys
from typing import Any

import structlog
from sqlalchemy import text

from src.application.bootstrap import bootstrap_player_stats
from src.application.reconcile_var_disallowed_goals import reconcile_var_disallowed_goals
from src.application.sync_fixture_events import sync_fixture_events
from src.config import get_settings
from src.infrastructure.db.repositories.match_event import SqlAlchemyMatchEventRepository
from src.infrastructure.db.repositories.player import SqlAlchemyPlayerRepository
from src.infrastructure.db.repositories.player_match_stat import SqlAlchemyPlayerMatchStatRepository
from src.infrastructure.db.repositories.player_tournament_stat import SqlAlchemyPlayerTournamentStatRepository
from src.infrastructure.db.repositories.raw_sportmonks_event import SqlAlchemyRawSportmonksEventRepository
from src.infrastructure.db.session import SessionLocal
from src.infrastructure.sportmonks.client import HttpxSportmonksClient, SportmonksClient
from src.infrastructure.sportmonks.projectors.player_match_stat import project_player_match_stat
from src.ingest.infrastructure.sportmonks_id_maps import SportmonksIdMaps, load_sportmonks_id_maps

log = structlog.get_logger(__name__)

_INCLUDE = "events.type;comments;lineups.position;lineups.details"


def _array(value: object) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


async def _sanitize_fixture(
    *,
    client: SportmonksClient,
    id_maps: SportmonksIdMaps,
    internal_id: int,
    sportmonks_id: int,
) -> None:
    endpoint = f"/fixtures/{sportmonks_id}"
    params = {"include": _INCLUDE}
    envelope = await client.get(endpoint, params=params)
    raw_data = envelope.get("data")
    data = raw_data if isinstance(raw_data, dict) else {}

    async with SessionLocal() as session:
        await SqlAlchemyRawSportmonksEventRepository(session).insert_if_new(
            endpoint=endpoint, params=params, response=envelope
        )

        events_payload = _array(data.get("events"))
        report = await sync_fixture_events(
            event_repo=SqlAlchemyMatchEventRepository(session),
            fixture_id=internal_id,
            events_payload=events_payload,
            player_id_by_sportmonks=id_maps.player_id_by_sportmonks,
            team_id_by_sportmonks=id_maps.team_id_by_sportmonks,
        )
        retracted_comments = await reconcile_var_disallowed_goals(
            session, fixture_id=internal_id, events_payload=events_payload
        )

        stat_repo = SqlAlchemyPlayerMatchStatRepository(session)
        stats_count = 0
        for lineup_payload in _array(data.get("lineups")):
            result = project_player_match_stat(
                lineup_payload,
                fixture_id=internal_id,
                player_id_by_sportmonks=id_maps.player_id_by_sportmonks,
            )
            if result is None:
                continue
            stat, raw_details = result
            await stat_repo.upsert(stat, raw_details=raw_details)
            stats_count += 1

        await session.commit()
        log.info(
            "sanitize_fixture.done",
            fixture_internal_id=internal_id,
            fixture_sportmonks_id=sportmonks_id,
            events_upserted=report.upserted,
            events_pruned=report.deleted,
            goal_comments_retracted=retracted_comments,
            player_match_stats=stats_count,
        )


async def _finished_fixture_smk_ids(season_id: int) -> list[int]:
    async with SessionLocal() as session:
        rows = await session.execute(
            text(
                """
                SELECT sportmonks_id FROM core.fixture
                WHERE season_id = :season_id AND status = 'finished' AND sportmonks_id IS NOT NULL
                ORDER BY kickoff_at
                """
            ),
            {"season_id": season_id},
        )
        return [int(r.sportmonks_id) for r in rows]


async def _refresh_tournament_stats(client: SportmonksClient, season_id: int) -> None:
    async with SessionLocal() as session:
        rows = await session.execute(
            text("SELECT id, sportmonks_id FROM core.team WHERE sportmonks_id IS NOT NULL ORDER BY id")
        )
        teams = [(int(r.sportmonks_id), r.id) for r in rows]
        count = await bootstrap_player_stats(
            client=client,
            raw_archive=SqlAlchemyRawSportmonksEventRepository(session),
            player_repo=SqlAlchemyPlayerRepository(session),
            stat_repo=SqlAlchemyPlayerTournamentStatRepository(session),
            teams=teams,
            season_id=season_id,
        )
        await session.commit()
        log.info("sanitize.tournament_stats_refreshed", teams=len(teams), upserts=count)


async def run(argv: list[str]) -> None:
    settings = get_settings()
    if not settings.sportmonks_api_token:
        raise SystemExit("SPORTMONKS_API_TOKEN not set in environment / .env")
    season_id = settings.active_season_id

    refresh_stats = "--refresh-tournament-stats" in argv
    args = [a for a in argv if a != "--refresh-tournament-stats"]

    if args == ["--all-finished"]:
        smk_ids = await _finished_fixture_smk_ids(season_id)
    elif args and all(a.isdigit() for a in args):
        smk_ids = [int(a) for a in args]
    else:
        raise SystemExit(f"usage: {sys.argv[0]} (--all-finished | <smk_fixture_id> ...) [--refresh-tournament-stats]")

    async with HttpxSportmonksClient(
        base_url=settings.sportmonks_base_url,
        api_token=settings.sportmonks_api_token,
    ) as client:
        async with SessionLocal() as session:
            id_maps = await load_sportmonks_id_maps(session)
        internal_by_smk = {smk: internal for internal, smk in id_maps.fixture_smk_by_internal.items()}

        for smk_id in smk_ids:
            internal_id = internal_by_smk.get(smk_id)
            if internal_id is None:
                log.warning("sanitize_fixture.unknown", fixture_sportmonks_id=smk_id)
                continue
            await _sanitize_fixture(client=client, id_maps=id_maps, internal_id=internal_id, sportmonks_id=smk_id)

        if refresh_stats:
            await _refresh_tournament_stats(client, season_id)


def main() -> int:
    asyncio.run(run(sys.argv[1:]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
