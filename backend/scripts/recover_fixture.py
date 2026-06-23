"""One-shot recovery for a single finished fixture whose live capture was cut short.

DDD role: Adapter (driving) — a manual operational entry point that drives the
SAME canonical inplay path the live daemon uses (``SportmonksInplayPoller.
poll_once``), exactly once, against the now-final Sportmonks payload.

Why this exists: the ingest supervisor polls a fixture only inside a static,
schedule-based window ``[kickoff - pre, kickoff + max_match_duration + post_ft]``
(see ``ingest/domain/inplay_window``). An exceptional long delay (e.g. a 2h
weather suspension) pushes real full-time past that window, so the poller is
reaped mid-match and never re-spawned: late goals, final ratings and the
full-time settlement are all lost. Re-opening the window won't help once the
match is over and a day has passed — this script performs the missed work
manually.

The match being over, ONE ``/fixtures/{id}`` fetch returns the complete final
state. A single ``poll_once`` then:
  - upserts the fixture (final score / FINISHED status),
  - upserts every event (the missing goals, subs, cards, VAR),
  - projects the final per-player stats and RE-PRICES from the final ratings
    (the dominant, path-independent term of the live price — see
    ``valuation/pricing.py``), so a player who scored after the cut is lifted,
  - with ``settle_grace_seconds=0``, banks the full-time settlement (collective
    result: group win / knockout elimination) in the same pass.

Idempotent: every projection is an upsert-by-sportmonks-id and settlement is
DB-guarded, so re-running is a safe no-op once applied. A NullPublisher is used
because this is a post-hoc recovery — clients reconcile from the DB on next
fetch, so no live NATS push is needed.

Usage (DATABASE_URL must point at the TARGET database):
    DATABASE_URL=postgresql+asyncpg://...  APP_ENV=dev \\
        uv run python scripts/recover_fixture.py <sportmonks_fixture_id>
"""

import asyncio
import sys

import structlog

from src.config import get_settings
from src.infrastructure.db.session import SessionLocal
from src.infrastructure.sportmonks.client import HttpxSportmonksClient
from src.ingest.infrastructure.sportmonks_id_maps import load_sportmonks_id_maps
from src.ingest.infrastructure.sportmonks_inplay_poller import SportmonksInplayPoller

log = structlog.get_logger(__name__)


class _NullPublisher:
    """No-op NotificationPublisher: a post-hoc recovery needs no live push."""

    async def publish(self, subject: str, payload: bytes) -> None:
        return None


async def recover(sportmonks_fixture_id: int) -> None:
    settings = get_settings()
    if not settings.sportmonks_api_token:
        raise SystemExit("SPORTMONKS_API_TOKEN not set in environment / .env")

    async with HttpxSportmonksClient(
        base_url=settings.sportmonks_base_url,
        api_token=settings.sportmonks_api_token,
    ) as client:
        async with SessionLocal() as session:
            id_maps = await load_sportmonks_id_maps(session)

        internal_by_smk = {smk: internal for internal, smk in id_maps.fixture_smk_by_internal.items()}
        internal_id = internal_by_smk.get(sportmonks_fixture_id)
        if internal_id is None:
            raise SystemExit(f"fixture sportmonks_id={sportmonks_fixture_id} not found in the target DB id maps")

        poller = SportmonksInplayPoller(
            fixture_internal_id=internal_id,
            fixture_sportmonks_id=sportmonks_fixture_id,
            poll_seconds=0.0,
            client=client,
            publisher=_NullPublisher(),
            session_factory=SessionLocal,
            id_maps=id_maps,
            # Final data is long stable → no stabilization wait; settle this pass.
            settle_grace_seconds=0.0,
        )
        log.info("recover.start", fixture_internal_id=internal_id, fixture_sportmonks_id=sportmonks_fixture_id)
        await poller.poll_once()
        log.info(
            "recover.done",
            fixture_internal_id=internal_id,
            fixture_sportmonks_id=sportmonks_fixture_id,
            settled=poller._settled,
        )


def main() -> int:
    if len(sys.argv) != 2 or not sys.argv[1].isdigit():
        raise SystemExit(f"usage: {sys.argv[0]} <sportmonks_fixture_id>")
    asyncio.run(recover(int(sys.argv[1])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
