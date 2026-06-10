"""Integration test for DbStartingPriceProvider against the REAL DB.

Verifies the NULL -> None contract: a player with a seeded ``base_value`` returns
its value; a player with NULL returns ``None`` (unpriceable), never a fabricated
number. Read-only — uses whatever players the dev DB already holds.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.valuation.db_starting_price_provider import DbStartingPriceProvider


@pytest.mark.anyio
async def test_maps_base_value_and_nulls(isolated_session: AsyncSession) -> None:
    with_bv = (
        await isolated_session.execute(
            text("SELECT id, base_value FROM core.player WHERE base_value IS NOT NULL ORDER BY id LIMIT 1")
        )
    ).first()
    without_bv = (
        await isolated_session.execute(
            text("SELECT id FROM core.player WHERE base_value IS NULL ORDER BY id LIMIT 1")
        )
    ).first()
    if with_bv is None or without_bv is None:  # pragma: no cover — needs a seeded DB
        pytest.skip("DB lacks both a seeded and an unseeded player — run the base_value seed first")

    provider = DbStartingPriceProvider(isolated_session)
    result = await provider.get_many([with_bv.id, without_bv.id, -1])

    assert result[with_bv.id] == pytest.approx(float(with_bv.base_value))
    assert result[without_bv.id] is None  # NULL base_value -> unpriceable
    assert result[-1] is None  # absent player -> None, not missing key
