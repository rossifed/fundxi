"""Bootstrap fixture details — Application Service.

DDD role: Application Service. Walks every fixture in the DB and ingests
its lineups + structured events + per-match kit colors from Sportmonks.
Idempotent on (sportmonks_id) for both lineup and event projections;
kit colors are an UPDATE on the existing fixture row.

One call per fixture:
    /fixtures/{sportmonks_id}?include=events.type;lineups.position;metadata
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
from src.infrastructure.db.repositories.team_match_stat import SqlAlchemyTeamMatchStatRepository
from src.infrastructure.db.repositories.venue import SqlAlchemyVenueRepository
from src.infrastructure.sportmonks.projectors.fixture_formation import project_fixture_formations
from src.infrastructure.sportmonks.projectors.fixture_kit import project_fixture_kit_colors
from src.infrastructure.sportmonks.projectors.lineup import project_lineup
from src.infrastructure.sportmonks.projectors.match_event import project_match_event
from src.infrastructure.sportmonks.projectors.team_match_stat import project_team_match_stats
from src.infrastructure.sportmonks.projectors.venue import project_venue

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

    venue_repo = SqlAlchemyVenueRepository(session)
    team_stat_repo = SqlAlchemyTeamMatchStatRepository(session)

    for smk_fixture_id, internal_fixture_id in fixture_id_by_smk.items():
        endpoint = f"/fixtures/{smk_fixture_id}"
        params = {"include": "events.type;lineups.position;metadata;venue;stage;round;statistics.type"}
        envelope = await client.get(endpoint, params=params)
        await raw_archive.insert_if_new(endpoint=endpoint, params=params, response=envelope)
        fixtures_count += 1

        # Per-match kit colors (Sportmonks metadata type_id 161 / 162).
        metadata_items = list(_items(envelope, "metadata"))
        kit = project_fixture_kit_colors(metadata_items)
        await fixture_repo.set_kit_colors(
            sportmonks_id=smk_fixture_id,
            home_kit_color=kit.home_color,
            away_kit_color=kit.away_color,
            home_kit_palette=kit.home_palette,
            away_kit_palette=kit.away_palette,
        )

        # Per-match tactical formation (Sportmonks metadata type_id 159).
        formations = project_fixture_formations(metadata_items)
        await fixture_repo.set_formations(
            sportmonks_id=smk_fixture_id,
            home_formation=formations.home,
            away_formation=formations.away,
        )

        # Venue + tournament phase (Sportmonks venue / stage / round includes).
        data = envelope.get("data") if isinstance(envelope.get("data"), dict) else {}
        venue_projection = project_venue(data.get("venue") if isinstance(data, dict) else None)
        venue_internal_id: int | None = None
        if venue_projection is not None:
            venue_internal_id = await venue_repo.upsert(venue_projection)
        stage_payload = data.get("stage") if isinstance(data, dict) else None
        round_payload = data.get("round") if isinstance(data, dict) else None
        stage_name = stage_payload.get("name") if isinstance(stage_payload, dict) else None
        round_name = round_payload.get("name") if isinstance(round_payload, dict) else None
        await fixture_repo.set_venue_and_phase(
            sportmonks_id=smk_fixture_id,
            venue_id=venue_internal_id,
            stage_name=stage_name if isinstance(stage_name, str) else None,
            round_name=round_name if isinstance(round_name, str) else None,
        )

        # Team-level match statistics (Sportmonks ``statistics.type``).
        stat_rows = project_team_match_stats(data.get("statistics") if isinstance(data, dict) else None)
        team_stat_payload: list[tuple[str, str, Any]] = []
        for stat in stat_rows:
            internal_team_id = team_id_by_smk.get(stat.sportmonks_team_id)
            if internal_team_id is None:
                continue
            team_stat_payload.append((internal_team_id, stat.type_code, stat.value))
        await team_stat_repo.upsert_batch(fixture_id=internal_fixture_id, rows=team_stat_payload)

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
