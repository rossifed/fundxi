"""Backfill tournament phase labels (stage / round) onto fixtures.

DDD role: Application Service (one-shot backfill use case).

Why this exists: the bracket view filters fixtures by ``stage_name``
("Round of 16", "Quarter-finals", ...). That column is only populated
when a fixture is fetched from Sportmonks with the ``stage`` / ``round``
includes. Fixtures loaded by the plain ``/fixtures`` list bootstrap
(includes ``participants;state;scores`` only) have it NULL — so the
bracket renders empty.

This service does the minimal, surgical fetch: ``/fixtures/{id}`` with
ONLY ``include=stage;round``, archives the raw response (data-sourcing
rule: the provider payload is the source of truth), extracts the two
authoritative name strings and writes ONLY ``stage_name`` /
``round_name`` via ``FixtureRepository.set_phase`` — venue / events /
lineups are left untouched.

Idempotent: the raw archive dedupes on response hash; the UPDATE is
deterministic.
"""

from dataclasses import dataclass

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.bootstrap_fixture_details import RawEventArchive
from src.domain.match.fixture_repository import FixtureRepository
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.sportmonks.client import SportmonksClient

log = structlog.get_logger(__name__)

# Only the phase includes — deliberately narrow so the call is cheap and
# we don't re-pull events / lineups / statistics.
_PHASE_INCLUDE = "stage;round"


@dataclass(frozen=True, slots=True)
class FixturePhaseReport:
    fixtures_seen: int
    updated: int
    skipped_no_phase: int


def _phase_name(payload: object) -> str | None:
    """Extract ``.name`` from a Sportmonks stage / round include object."""
    if isinstance(payload, dict):
        name = payload.get("name")
        return name if isinstance(name, str) else None
    return None


async def backfill_fixture_phase(
    *,
    session: AsyncSession,
    client: SportmonksClient,
    raw_archive: RawEventArchive,
    fixture_repo: FixtureRepository,
    season_id: int | None = None,
) -> FixturePhaseReport:
    """Fetch stage / round for every fixture (optionally scoped to one
    season) and write the phase labels. Returns a count report."""
    stmt = select(FixtureORM.sportmonks_id).where(FixtureORM.sportmonks_id.is_not(None))
    if season_id is not None:
        stmt = stmt.where(FixtureORM.season_id == season_id)
    smk_ids = [int(row) for row in (await session.execute(stmt)).scalars().all() if row is not None]

    log.info("backfill_fixture_phase.start", fixtures=len(smk_ids), season_id=season_id)

    updated = 0
    skipped = 0
    for smk_id in smk_ids:
        endpoint = f"/fixtures/{smk_id}"
        params = {"include": _PHASE_INCLUDE}
        envelope = await client.get(endpoint, params=params)
        await raw_archive.insert_if_new(endpoint=endpoint, params=params, response=envelope)

        data = envelope.get("data") if isinstance(envelope.get("data"), dict) else {}
        stage_name = _phase_name(data.get("stage") if isinstance(data, dict) else None)
        round_name = _phase_name(data.get("round") if isinstance(data, dict) else None)

        if stage_name is None and round_name is None:
            skipped += 1
            log.warning("backfill_fixture_phase.no_phase", sportmonks_id=smk_id)
            continue

        await fixture_repo.set_phase(
            sportmonks_id=smk_id,
            stage_name=stage_name,
            round_name=round_name,
        )
        updated += 1
        log.debug(
            "backfill_fixture_phase.updated",
            sportmonks_id=smk_id,
            stage=stage_name,
            round=round_name,
        )

    return FixturePhaseReport(
        fixtures_seen=len(smk_ids),
        updated=updated,
        skipped_no_phase=skipped,
    )
