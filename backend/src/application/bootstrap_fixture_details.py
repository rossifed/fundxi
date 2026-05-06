"""Bootstrap fixture details — Application Service.

DDD role: Application Service. Walks every fixture in the DB and ingests
its lineups + structured events from Sportmonks. Idempotent on
(sportmonks_id) for both projections.

One call per fixture: `/fixtures/{sportmonks_id}?include=events.type;lineups.position`.
~64 API calls for the WC2022 dataset.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, Protocol

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.fixture_repository import FixtureRepository
from src.domain.match.lineup import Lineup, LineupRepository
from src.domain.match.match_event import MatchEvent, MatchEventRepository
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.models.team import TeamORM
from src.infrastructure.sportmonks.client import SportmonksClient
from src.infrastructure.sportmonks.projectors.lineup import project_lineup
from src.infrastructure.sportmonks.projectors.match_event import project_match_event

log = structlog.get_logger(__name__)


class RawEventArchive(Protocol):
    async def insert_if_new(self, *, endpoint: str, params: dict[str, Any], response: dict[str, Any]) -> bool: ...


@dataclass(frozen=True, slots=True)
class FixtureDetailsReport:
    fixtures: int
    lineups: int
    events: int
    skipped: int


def _items(envelope: dict[str, Any], key: str) -> Iterable[dict[str, Any]]:
    arr = (envelope.get("data") or {}).get(key) if isinstance(envelope.get("data"), dict) else None
    if not isinstance(arr, list):
        return ()
    return [item for item in arr if isinstance(item, dict)]


async def bootstrap_fixture_details(
    *,
    session: AsyncSession,
    client: SportmonksClient,
    raw_archive: RawEventArchive,
    fixture_repo: FixtureRepository,
    lineup_repo: LineupRepository,
    event_repo: MatchEventRepository,
) -> FixtureDetailsReport:
    # Resolve sportmonks → internal id maps once.
    teams = (
        await session.execute(select(TeamORM.id, TeamORM.sportmonks_id).where(TeamORM.sportmonks_id.is_not(None)))
    ).all()
    team_id_by_smk: dict[int, str] = {row.sportmonks_id: row.id for row in teams if row.sportmonks_id is not None}

    players = (
        await session.execute(
            select(PlayerORM.id, PlayerORM.sportmonks_id).where(PlayerORM.sportmonks_id.is_not(None))
        )
    ).all()
    player_id_by_smk: dict[int, int] = {row.sportmonks_id: row.id for row in players if row.sportmonks_id is not None}

    fixture_id_by_smk = await fixture_repo.map_sportmonks_to_internal_id()
    log.info(
        "bootstrap_fixture_details.preloaded",
        fixtures=len(fixture_id_by_smk),
        teams=len(team_id_by_smk),
        players=len(player_id_by_smk),
    )

    fixtures_count = 0
    lineups_count = 0
    events_count = 0
    skipped = 0

    for smk_fixture_id, internal_fixture_id in fixture_id_by_smk.items():
        endpoint = f"/fixtures/{smk_fixture_id}"
        params = {"include": "events.type;lineups.position"}
        envelope = await client.get(endpoint, params=params)
        await raw_archive.insert_if_new(endpoint=endpoint, params=params, response=envelope)
        fixtures_count += 1

        # Lineups
        for lineup_payload in _items(envelope, "lineups"):
            try:
                lineup, smk = project_lineup(
                    lineup_payload,
                    fixture_id=internal_fixture_id,
                    player_id_by_sportmonks=player_id_by_smk,
                    team_id_by_sportmonks=team_id_by_smk,
                )
            except (ValueError, TypeError) as exc:
                log.debug("bootstrap_fixture_details.lineup_skip", reason=str(exc))
                skipped += 1
                continue
            await lineup_repo.upsert_by_sportmonks_id(lineup, sportmonks_id=smk)
            lineups_count += 1

        # Events
        for event_payload in _items(envelope, "events"):
            try:
                event, smk = project_match_event(
                    event_payload,
                    fixture_id=internal_fixture_id,
                    player_id_by_sportmonks=player_id_by_smk,
                    team_id_by_sportmonks=team_id_by_smk,
                )
            except (ValueError, TypeError) as exc:
                log.debug("bootstrap_fixture_details.event_skip", reason=str(exc))
                skipped += 1
                continue
            await event_repo.upsert_by_sportmonks_id(event, sportmonks_id=smk)
            events_count += 1

    log.info(
        "bootstrap_fixture_details.done",
        fixtures=fixtures_count,
        lineups=lineups_count,
        events=events_count,
        skipped=skipped,
    )
    # Cast Lineup/MatchEvent locally so pyright sees the import is real.
    _ = Lineup, MatchEvent
    return FixtureDetailsReport(fixtures=fixtures_count, lineups=lineups_count, events=events_count, skipped=skipped)
