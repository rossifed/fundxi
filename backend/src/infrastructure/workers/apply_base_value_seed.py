"""Worker (prod): apply the committed base-value seeds to the database.

DDD role: Adapter (driving). The prod-side applier — the deterministic counterpart
of ``export_base_value_seed``. Reads ``backend/seeds/*.jsonl`` and writes them by the
portable ``sportmonks_id`` / ``tm_player_id`` key, so a fresh database (different
autoincrement ids) ends up in exactly the validated dev state WITHOUT re-scraping
Transfermarkt or re-running the matcher.

Run AFTER ``alembic upgrade head`` and the 26618 bootstrap. Steps, all idempotent:
1. Reload the Transfermarkt raw archive (audit / source-of-truth).
2. Apply name corrections for players Sportmonks corrupted at source.
3. Apply the resolved ``base_value`` + ``base_value_source`` per player.

Run:  uv run python -m src.infrastructure.workers.apply_base_value_seed
"""

import asyncio
import json
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

import structlog
from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.repositories.transfermarkt_market_value import (
    SqlAlchemyTransfermarktMarketValueRepository,
    TransfermarktRow,
)
from src.infrastructure.db.session import SessionLocal

log = structlog.get_logger(__name__)

_SEEDS_DIR = Path(__file__).resolve().parents[3] / "seeds"


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


async def _load_transfermarkt_archive(session: AsyncSession) -> int:
    rows = _read_jsonl(_SEEDS_DIR / "transfermarkt_market_value.jsonl")
    repo = SqlAlchemyTransfermarktMarketValueRepository(session)
    return await repo.upsert_many(
        [
            TransfermarktRow(
                tm_player_id=int(r["tm_player_id"]),
                player_slug=str(r["player_slug"]),
                player_name=str(r["player_name"]),
                team_slug=str(r["team_slug"]),
                team_name=str(r["team_name"]),
                team_verein_id=int(r["team_verein_id"]),
                market_value_m=Decimal(str(r["market_value_m"])),
                snapshot_date=date.fromisoformat(str(r["snapshot_date"])),
            )
            for r in rows
        ]
    )


async def _apply_name_corrections(session: AsyncSession) -> int:
    rows = _read_jsonl(_SEEDS_DIR / "player_name_corrections.jsonl")
    if not rows:
        return 0
    await session.execute(
        text("UPDATE core.player SET name = :name WHERE sportmonks_id = :sportmonks_id AND name <> :name"),
        [{"sportmonks_id": int(r["sportmonks_id"]), "name": str(r["name"])} for r in rows],
    )
    return len(rows)


async def _apply_base_values(session: AsyncSession) -> tuple[int, list[int]]:
    rows = _read_jsonl(_SEEDS_DIR / "player_base_value.jsonl")
    id_rows = await session.execute(
        text("SELECT sportmonks_id FROM core.player WHERE sportmonks_id IS NOT NULL")
    )
    present = {row.sportmonks_id for row in id_rows}
    missing = [int(r["sportmonks_id"]) for r in rows if int(r["sportmonks_id"]) not in present]
    applicable = [r for r in rows if int(r["sportmonks_id"]) in present]
    if applicable:
        await session.execute(
            text(
                """
                UPDATE core.player
                SET base_value = :base_value, base_value_source = :source
                WHERE sportmonks_id = :sportmonks_id
                """
            ).bindparams(bindparam("source")),
            [
                {
                    "sportmonks_id": int(r["sportmonks_id"]),
                    "base_value": Decimal(str(r["base_value"])),
                    "source": str(r["source"]),
                }
                for r in applicable
            ],
        )
    return len(applicable), missing


async def run() -> None:
    structlog.configure(processors=[structlog.processors.add_log_level, structlog.dev.ConsoleRenderer()])
    async with SessionLocal() as session:
        tm_loaded = await _load_transfermarkt_archive(session)
        names_fixed = await _apply_name_corrections(session)
        base_applied, missing = await _apply_base_values(session)
        await session.commit()
    log.info(
        "apply.done",
        tm_archive_rows=tm_loaded,
        names_fixed=names_fixed,
        base_values_applied=base_applied,
        sportmonks_ids_not_in_db=len(missing),
    )
    if missing:
        log.warning("apply.missing_players", count=len(missing), sample=sorted(missing)[:20])


if __name__ == "__main__":
    asyncio.run(run())
