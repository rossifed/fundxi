"""Shared writer for ``valuation.player_price_tick``.

Single source for the ``INSERT ... ON CONFLICT (player_id, ts) DO NOTHING``
used by every price producer — the live pollers, the synthetic minute sink,
the replay baseline seeding, the rehearsal CLI, and the simulation
``PlayerPriceTickWriter`` adapter. The conflict key, the column set and the
"first writer for a (player_id, ts) wins" idempotency now live in exactly one
place, so a change to any of them is a one-line edit rather than a five-site
sweep.

DDD role: shared persistence helper (driven side). Pure SQL emission, no
business logic — callers supply already-computed values.
"""

from collections.abc import Mapping, Sequence
from datetime import datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM

_CONFLICT_KEYS = ["player_id", "ts"]


def price_tick_row(
    *,
    player_id: int,
    ts: datetime,
    fixture_id: int | None,
    current_price: float,
    performance_rating: float,
    change_since_open: float,
    source: str,
) -> dict[str, object]:
    """Build one tick row dict — the column set is defined here, once."""
    return {
        "player_id": player_id,
        "ts": ts,
        "fixture_id": fixture_id,
        "current_price": current_price,
        "performance_rating": performance_rating,
        "change_since_open": change_since_open,
        "source": source,
    }


async def upsert_price_tick(
    session: AsyncSession,
    *,
    player_id: int,
    ts: datetime,
    fixture_id: int | None,
    current_price: float,
    performance_rating: float,
    change_since_open: float,
    source: str,
) -> None:
    """Append one tick; the first writer for a ``(player_id, ts)`` wins."""
    row = price_tick_row(
        player_id=player_id,
        ts=ts,
        fixture_id=fixture_id,
        current_price=current_price,
        performance_rating=performance_rating,
        change_since_open=change_since_open,
        source=source,
    )
    await session.execute(
        pg_insert(PlayerPriceTickORM).values(row).on_conflict_do_nothing(index_elements=_CONFLICT_KEYS)
    )


async def upsert_price_ticks(session: AsyncSession, rows: Sequence[Mapping[str, object]]) -> int:
    """Batch append; no-op on empty input. Returns the number of rows submitted."""
    if not rows:
        return 0
    await session.execute(
        pg_insert(PlayerPriceTickORM).values(list(rows)).on_conflict_do_nothing(index_elements=_CONFLICT_KEYS)
    )
    return len(rows)
