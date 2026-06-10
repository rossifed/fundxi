"""Unit tests for SyntheticStartingPriceProvider (sim adapter)."""

from datetime import UTC, datetime

import pytest

from src.infrastructure.valuation.synthetic_starting_price_provider import SyntheticStartingPriceProvider
from src.infrastructure.valuation.synthetic_valuation_provider import synthesize_valuation

_AS_OF = datetime(2026, 6, 10, tzinfo=UTC)


@pytest.mark.anyio
async def test_returns_synthetic_base_value_for_each_player() -> None:
    provider = SyntheticStartingPriceProvider(as_of=_AS_OF)
    result = await provider.get_many([1, 2, 3])
    assert result == {pid: synthesize_valuation(pid, as_of=_AS_OF).base_value for pid in (1, 2, 3)}


@pytest.mark.anyio
async def test_never_returns_none() -> None:
    provider = SyntheticStartingPriceProvider(as_of=_AS_OF)
    result = await provider.get_many([42])
    assert result[42] is not None and result[42] > 0


@pytest.mark.anyio
async def test_empty_input_is_empty_output() -> None:
    provider = SyntheticStartingPriceProvider(as_of=_AS_OF)
    assert await provider.get_many([]) == {}
