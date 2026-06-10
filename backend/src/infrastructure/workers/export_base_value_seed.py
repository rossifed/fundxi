"""Worker (dev): export the resolved base-value state to committed JSONL seeds.

DDD role: Adapter (driving). The DEV-side generator. It freezes two things from
the validated dev database into ``backend/seeds/`` so a fresh prod database can be
seeded deterministically — keyed on the portable ``sportmonks_id`` / ``tm_player_id``
(never the autoincrement ``core.player.id``, which differs across databases):

- ``transfermarkt_market_value.jsonl`` — the one-shot Transfermarkt scrape (raw
  archive). Lets prod reload it without ever re-scraping Transfermarkt.
- ``player_base_value.jsonl`` — the resolved ``(sportmonks_id, base_value, source)``
  for every seeded player. Bakes in ALL reconciliation done here (name matching,
  overrides, romanisation, manual fills), so prod just applies the result.

The matcher (``application/base_value_seed.py``) stays the documented generator of
the second file; prod does not re-run it. Re-run this after refreshing the TM
snapshot or changing the matcher.

Run:  uv run python -m src.infrastructure.workers.export_base_value_seed
"""

import asyncio
import json
from collections.abc import Mapping, Sequence
from pathlib import Path

import structlog
from sqlalchemy import text

from src.infrastructure.db.session import SessionLocal

log = structlog.get_logger(__name__)

_SEEDS_DIR = Path(__file__).resolve().parents[3] / "seeds"


def _write_jsonl(path: Path, rows: Sequence[Mapping[str, object]]) -> None:
    with path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


async def run() -> None:
    structlog.configure(processors=[structlog.processors.add_log_level, structlog.dev.ConsoleRenderer()])
    _SEEDS_DIR.mkdir(parents=True, exist_ok=True)

    async with SessionLocal() as session:
        tm_rows = (
            await session.execute(
                text(
                    """
                    SELECT tm_player_id, player_slug, player_name, team_slug, team_name,
                           team_verein_id, market_value_m, currency, snapshot_date
                    FROM raw.transfermarkt_market_value
                    ORDER BY tm_player_id
                    """
                )
            )
        ).all()
        tm_seed = [
            {
                "tm_player_id": r.tm_player_id,
                "player_slug": r.player_slug,
                "player_name": r.player_name,
                "team_slug": r.team_slug,
                "team_name": r.team_name,
                "team_verein_id": r.team_verein_id,
                "market_value_m": str(r.market_value_m),
                "currency": r.currency,
                "snapshot_date": r.snapshot_date.isoformat(),
            }
            for r in tm_rows
        ]

        bv_rows = (
            await session.execute(
                text(
                    """
                    SELECT sportmonks_id, base_value, base_value_source
                    FROM core.player
                    WHERE base_value IS NOT NULL AND sportmonks_id IS NOT NULL
                    ORDER BY sportmonks_id
                    """
                )
            )
        ).all()
        bv_seed = [
            {"sportmonks_id": r.sportmonks_id, "base_value": str(r.base_value), "source": r.base_value_source}
            for r in bv_rows
        ]

    _write_jsonl(_SEEDS_DIR / "transfermarkt_market_value.jsonl", tm_seed)
    _write_jsonl(_SEEDS_DIR / "player_base_value.jsonl", bv_seed)
    log.info("export.done", tm_rows=len(tm_seed), base_values=len(bv_seed), dir=str(_SEEDS_DIR))


if __name__ == "__main__":
    asyncio.run(run())
