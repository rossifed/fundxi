"""One-shot: re-run the VAR-disallowed-goal reconciliation for one fixture.

When a disallowed goal slipped through live capture (e.g. the VAR review's minute
was offset from the goal's, or the scorer's transliteration differed), this fetches
the now-final Sportmonks events and runs ONLY ``reconcile_var_disallowed_goals`` —
deleting the phantom goal event and flipping its goal comment.

Unlike ``recover_fixture.py`` it does NOT re-price or re-settle, so it is SAFE on an
already-settled fixture: a full ``poll_once`` would re-run live pricing from the
carried-in price and overwrite the banked settlement ticks. This script touches
only the match_event / match_comment twins. Idempotent.

Usage (DATABASE_URL must point at the TARGET database):
    DATABASE_URL=postgresql+asyncpg://...  APP_ENV=dev  PYTHONPATH=. \\
        uv run python -m scripts.reconcile_fixture_var <sportmonks_fixture_id>
"""

import asyncio
import sys

import structlog

from src.application.reconcile_var_disallowed_goals import reconcile_var_disallowed_goals
from src.config import get_settings
from src.infrastructure.db.session import SessionLocal
from src.infrastructure.sportmonks.client import HttpxSportmonksClient
from src.ingest.infrastructure.sportmonks_id_maps import load_sportmonks_id_maps

log = structlog.get_logger(__name__)


async def run(sportmonks_fixture_id: int) -> None:
    settings = get_settings()
    if not settings.sportmonks_api_token:
        raise SystemExit("SPORTMONKS_API_TOKEN not set in environment / .env")

    async with HttpxSportmonksClient(
        base_url=settings.sportmonks_base_url,
        api_token=settings.sportmonks_api_token,
    ) as client:
        envelope = await client.get(f"/fixtures/{sportmonks_fixture_id}", params={"include": "events.type"})

    raw_data = envelope.get("data")
    data = raw_data if isinstance(raw_data, dict) else {}
    events = [e for e in (data.get("events") or []) if isinstance(e, dict)]

    async with SessionLocal() as session:
        id_maps = await load_sportmonks_id_maps(session)
        internal_by_smk = {smk: internal for internal, smk in id_maps.fixture_smk_by_internal.items()}
        internal_id = internal_by_smk.get(sportmonks_fixture_id)
        if internal_id is None:
            raise SystemExit(f"fixture sportmonks_id={sportmonks_fixture_id} not found in the target DB")

        retracted = await reconcile_var_disallowed_goals(
            session,
            fixture_id=internal_id,
            events_payload=events,
            player_id_by_sportmonks=id_maps.player_id_by_sportmonks,
        )
        await session.commit()
        log.info(
            "reconcile_fixture_var.done",
            fixture_internal_id=internal_id,
            fixture_sportmonks_id=sportmonks_fixture_id,
            retracted=retracted,
        )


def main() -> int:
    if len(sys.argv) != 2 or not sys.argv[1].isdigit():
        raise SystemExit(f"usage: {sys.argv[0]} <sportmonks_fixture_id>")
    asyncio.run(run(int(sys.argv[1])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
