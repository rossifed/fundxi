"""Unit tests for the trade request DTO validation (F7).

``shares`` must be strictly positive — direction is carried by ``kind``, never
by the sign of the quantity. A non-positive quantity is rejected at the
transport boundary (clean 422) before any portfolio state is touched.
"""

import pytest
from pydantic import ValidationError

from src.api.dtos.portfolio import TradeRequestBody


def test_positive_shares_is_accepted() -> None:
    body = TradeRequestBody(player_id=1, kind="buy", shares=2.5)
    assert body.shares == 2.5
    assert body.price is None  # advisory, optional


@pytest.mark.parametrize("bad", [0.0, -1.0, -0.0001])
def test_non_positive_shares_is_rejected(bad: float) -> None:
    with pytest.raises(ValidationError):
        TradeRequestBody(player_id=1, kind="buy", shares=bad)
