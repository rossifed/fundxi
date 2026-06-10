"""SqlAlchemyTransfermarktMarketValueRepository — raw scrape archive writer.

DDD role: Infrastructure-only Adapter (raw rows are not a domain concept). Upsert
on ``tm_player_id``: re-scraping is idempotent and a fresh snapshot overwrites the
value (last-write-wins).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.transfermarkt_market_value import TransfermarktMarketValueORM


@dataclass(frozen=True)
class TransfermarktRow:
    tm_player_id: int
    player_slug: str
    player_name: str
    team_slug: str
    team_name: str
    team_verein_id: int
    market_value_m: Decimal
    snapshot_date: date


class SqlAlchemyTransfermarktMarketValueRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert_many(self, rows: Sequence[TransfermarktRow]) -> int:
        if not rows:
            return 0
        values = [
            {
                "tm_player_id": r.tm_player_id,
                "player_slug": r.player_slug,
                "player_name": r.player_name,
                "team_slug": r.team_slug,
                "team_name": r.team_name,
                "team_verein_id": r.team_verein_id,
                "market_value_m": r.market_value_m,
                "snapshot_date": r.snapshot_date,
            }
            for r in rows
        ]
        stmt = pg_insert(TransfermarktMarketValueORM).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=[TransfermarktMarketValueORM.tm_player_id],
            set_={
                "player_slug": stmt.excluded.player_slug,
                "player_name": stmt.excluded.player_name,
                "team_slug": stmt.excluded.team_slug,
                "team_name": stmt.excluded.team_name,
                "team_verein_id": stmt.excluded.team_verein_id,
                "market_value_m": stmt.excluded.market_value_m,
                "snapshot_date": stmt.excluded.snapshot_date,
            },
        )
        await self._session.execute(stmt)
        return len(values)
