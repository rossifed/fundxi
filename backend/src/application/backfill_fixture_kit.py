"""Backfill per-match kit colors, then derive team accent colors.

DDD role: Application Service (one-shot backfill use case).

Why this exists: kit colors live in ``core.fixture.home/away_kit_color``
(+ ``*_kit_palette``), populated ONLY when a fixture is fetched with the
``metadata`` include (Sportmonks type_id 161 / 162). The plain
``/fixtures`` list bootstrap doesn't request it, so after a fixtures
wipe/reload the columns go NULL — teams then render with the neutral
grey, and ``core.team.color`` (derived from the kit palettes) is empty
too. The in-play poller repopulates only the handful of fixtures it
actually polls.

Surgical fetch: ``/fixtures/{id}`` with ONLY ``include=metadata``,
archive the raw payload (data-sourcing rule), project the kit
colors/palettes and write ONLY the four kit columns via
``FixtureRepository.set_kit_colors`` — events / lineups / statistics are
left untouched. Then re-derive ``core.team.color`` from the freshly
written palettes.

Idempotent: the raw archive dedupes on response hash; the UPDATEs are
deterministic.
"""

from dataclasses import dataclass

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.bootstrap_fixture_details import RawEventArchive
from src.application.derive_team_colors import derive_team_colors
from src.domain.match.fixture_repository import FixtureRepository
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.sportmonks.client import SportmonksClient
from src.infrastructure.sportmonks.projectors.fixture_kit import project_fixture_kit_colors

log = structlog.get_logger(__name__)

# Only the metadata include — deliberately narrow so the call is cheap and
# we don't re-pull events / lineups / statistics.
_KIT_INCLUDE = "metadata"


@dataclass(frozen=True, slots=True)
class FixtureKitReport:
    fixtures_seen: int
    kits_updated: int
    skipped_no_kit: int
    teams_colored: int


async def backfill_fixture_kit(
    *,
    session: AsyncSession,
    client: SportmonksClient,
    raw_archive: RawEventArchive,
    fixture_repo: FixtureRepository,
    season_id: int | None = None,
) -> FixtureKitReport:
    """Fetch kit metadata for every fixture (optionally scoped to one
    season), write the kit colors/palettes, then derive team accent
    colors. Returns a count report."""
    stmt = select(FixtureORM.sportmonks_id).where(FixtureORM.sportmonks_id.is_not(None))
    if season_id is not None:
        stmt = stmt.where(FixtureORM.season_id == season_id)
    smk_ids = [int(row) for row in (await session.execute(stmt)).scalars().all() if row is not None]

    log.info("backfill_fixture_kit.start", fixtures=len(smk_ids), season_id=season_id)

    updated = 0
    skipped = 0
    for smk_id in smk_ids:
        endpoint = f"/fixtures/{smk_id}"
        params = {"include": _KIT_INCLUDE}
        envelope = await client.get(endpoint, params=params)
        await raw_archive.insert_if_new(endpoint=endpoint, params=params, response=envelope)

        data = envelope.get("data") if isinstance(envelope.get("data"), dict) else {}
        metadata = data.get("metadata") if isinstance(data, dict) else None
        kit = project_fixture_kit_colors(metadata if isinstance(metadata, list) else None)

        if kit.home_color is None and kit.away_color is None:
            skipped += 1
            log.warning("backfill_fixture_kit.no_kit", sportmonks_id=smk_id)
            continue

        await fixture_repo.set_kit_colors(
            sportmonks_id=smk_id,
            home_kit_color=kit.home_color,
            away_kit_color=kit.away_color,
            home_kit_palette=kit.home_palette,
            away_kit_palette=kit.away_palette,
        )
        updated += 1
        log.debug(
            "backfill_fixture_kit.updated",
            sportmonks_id=smk_id,
            home=kit.home_color,
            away=kit.away_color,
        )

    # Re-derive team accent colours from the freshly written kit palettes.
    teams_colored = await derive_team_colors(session)

    return FixtureKitReport(
        fixtures_seen=len(smk_ids),
        kits_updated=updated,
        skipped_no_kit=skipped,
        teams_colored=teams_colored,
    )
