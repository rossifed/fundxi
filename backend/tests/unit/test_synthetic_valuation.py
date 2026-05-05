"""Unit tests for SyntheticValuationProvider — placeholder M5 valuation engine."""

from datetime import UTC, datetime

import pytest

from src.domain.valuation.player_valuation import ValuationSource
from src.infrastructure.valuation.synthetic_valuation_provider import (
    SyntheticValuationProvider,
    synthesize_valuation,
)


def test_synthesize_is_deterministic() -> None:
    a = synthesize_valuation(42, as_of=datetime(2026, 1, 1, tzinfo=UTC))
    b = synthesize_valuation(42, as_of=datetime(2026, 1, 1, tzinfo=UTC))
    assert a == b


def test_synthesize_diverges_per_player() -> None:
    a = synthesize_valuation(42, as_of=datetime(2026, 1, 1, tzinfo=UTC))
    b = synthesize_valuation(43, as_of=datetime(2026, 1, 1, tzinfo=UTC))
    assert a.base_value != b.base_value


def test_synthesize_value_ranges() -> None:
    for pid in [1, 100, 9999, 42424242]:
        v = synthesize_valuation(pid, as_of=datetime(2026, 1, 1, tzinfo=UTC))
        assert 5.0 <= v.base_value <= 120.0
        assert -8.0 <= v.change_24h <= 8.0
        assert 5.0 <= v.performance_rating <= 9.0
        assert v.source is ValuationSource.SYNTHETIC


@pytest.mark.anyio
async def test_provider_adapter_methods() -> None:
    p = SyntheticValuationProvider(as_of=datetime(2026, 1, 1, tzinfo=UTC))
    one = await p.get_for_player(42)
    assert one.player_id == 42

    batch = await p.get_for_players([42, 43, 44])
    assert set(batch.keys()) == {42, 43, 44}
    assert batch[42] == one
