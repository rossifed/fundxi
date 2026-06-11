"""Integration test for SqlAlchemyCurrentPriceProvider (F2 alignment).

Verifies the ``tick ?? base`` rule the portfolio-valuation read path uses to
mark positions: a ticked player resolves to its latest tick price, an un-ticked
player to its starting price (``base_value``) — the SAME rule the frontend's
valuation surface uses, so the value snapshot/history aligns with the UI totals
by construction.

Isolation: rolls back at teardown (only ``flush()`` is used).
"""

from datetime import UTC, datetime

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM
from src.infrastructure.db.repositories.portfolio_snapshot_adapters import (
    SqlAlchemyCurrentPriceProvider,
)


async def _two_players(session: AsyncSession) -> tuple[int, int]:
    """Two core.player ids whose ticks we clear in-session (rolled back at
    teardown) so the test fully controls their priced state."""
    rows = (await session.execute(text("SELECT id FROM core.player ORDER BY id LIMIT 2"))).all()
    if len(rows) < 2:  # pragma: no cover
        pytest.skip("need 2 players — bootstrap WC data first")
    a, b = int(rows[0][0]), int(rows[1][0])
    # Wipe any existing ticks for these two so "no tick" is deterministic.
    await session.execute(
        text("DELETE FROM valuation.player_price_tick WHERE player_id IN (:a, :b)"), {"a": a, "b": b}
    )
    return a, b


@pytest.mark.anyio
async def test_ticked_uses_tick_unticked_falls_back_to_base(isolated_session: AsyncSession) -> None:
    p_tick, p_base = await _two_players(isolated_session)

    # Give both a known base value, tick only the first.
    await isolated_session.execute(
        text("UPDATE core.player SET base_value = :v WHERE id = :id"), {"v": 42.0, "id": p_tick}
    )
    await isolated_session.execute(
        text("UPDATE core.player SET base_value = :v WHERE id = :id"), {"v": 7.5, "id": p_base}
    )
    isolated_session.add(
        PlayerPriceTickORM(
            player_id=p_tick,
            ts=datetime(2026, 6, 11, 12, 0, tzinfo=UTC),
            fixture_id=None,
            current_price=99.0,
            performance_rating=6.5,
            source="engine",
        )
    )
    await isolated_session.flush()

    provider = SqlAlchemyCurrentPriceProvider(isolated_session, as_of=datetime.now(UTC))
    prices = await provider.get_many([p_tick, p_base])

    assert prices[p_tick] == 99.0  # latest tick wins
    assert prices[p_base] == 7.5   # no tick → starting price (base_value)
