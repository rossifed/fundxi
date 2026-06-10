"""Unit tests for the pure trade-margin rule.

These exercise ``evaluate_margin`` directly — no DB, no session — covering the
four corners of the policy: a trade within the limit passes, a trade past it is
rejected, shorting is bounded the same way as buying, and a reducing trade is
allowed even when the portfolio is already over the limit.
"""

from src.domain.portfolio.margin import evaluate_margin

# A flat portfolio with €100M cash; the traded player trades at €10M.
_PRICE = 10.0


def test_buy_within_equity_is_allowed() -> None:
    # Buy 8 @10 = 80; cash 100 -> 20; equity 100; gross 80 <= limit 100.
    verdict = evaluate_margin(
        positions_before={},
        traded_player_id=1,
        shares_delta=8.0,
        prices={1: _PRICE},
        cash_after=100.0 - 8.0 * _PRICE,
        max_leverage=1.0,
    )
    assert verdict.ok
    assert verdict.equity == 100.0
    assert verdict.gross_exposure == 80.0


def test_buy_beyond_equity_is_rejected() -> None:
    # Buy 12 @10 = 120 > 100 cash; cash_after -20; gross 120 > limit 100.
    verdict = evaluate_margin(
        positions_before={},
        traded_player_id=1,
        shares_delta=12.0,
        prices={1: _PRICE},
        cash_after=100.0 - 12.0 * _PRICE,
        max_leverage=1.0,
    )
    assert not verdict.ok
    assert verdict.gross_exposure == 120.0
    assert verdict.limit == 100.0


def test_short_within_equity_is_allowed() -> None:
    # Short 8 @10: cash 100 -> 180; position -8; equity 180-80=100; gross 80.
    verdict = evaluate_margin(
        positions_before={},
        traded_player_id=1,
        shares_delta=-8.0,
        prices={1: _PRICE},
        cash_after=100.0 + 8.0 * _PRICE,
        max_leverage=1.0,
    )
    assert verdict.ok
    assert verdict.equity == 100.0
    assert verdict.gross_exposure == 80.0


def test_short_beyond_equity_is_rejected() -> None:
    # Short 12 @10: cash -> 220; equity 220-120=100; gross 120 > limit 100.
    # This is the exploit the rule closes: minting buying power via a short.
    verdict = evaluate_margin(
        positions_before={},
        traded_player_id=1,
        shares_delta=-12.0,
        prices={1: _PRICE},
        cash_after=100.0 + 12.0 * _PRICE,
        max_leverage=1.0,
    )
    assert not verdict.ok


def test_reducing_an_over_limit_position_is_always_allowed() -> None:
    # Already short 20 @10 (gross 200) on €100M equity — over the 1.0 limit.
    # Buying back 5 reduces the short to -15 (gross 150): still above the 100
    # limit, but below where it started, so it must be allowed.
    verdict = evaluate_margin(
        positions_before={1: -20.0},
        traded_player_id=1,
        shares_delta=5.0,  # BUY to cover
        prices={1: _PRICE},
        cash_after=300.0 - 5.0 * _PRICE,  # equity stays 100
        max_leverage=1.0,
    )
    assert verdict.ok
    assert verdict.gross_exposure == 150.0
    assert verdict.limit == 100.0  # over the normal limit, allowed only because it reduces


def test_increasing_an_over_limit_position_is_rejected() -> None:
    # Same over-limit short (-20, gross 200), but selling 5 more deepens it.
    verdict = evaluate_margin(
        positions_before={1: -20.0},
        traded_player_id=1,
        shares_delta=-5.0,  # SELL to extend the short
        prices={1: _PRICE},
        cash_after=300.0 + 5.0 * _PRICE,
        max_leverage=1.0,
    )
    assert not verdict.ok
    assert verdict.gross_exposure == 250.0


def test_other_holdings_count_toward_exposure_and_equity() -> None:
    # Hold 5 of player 2 (worth 50) with 50 cash -> equity 100. Buying 6 of
    # player 1 (60) pushes gross to 110 > limit 100.
    verdict = evaluate_margin(
        positions_before={2: 5.0},
        traded_player_id=1,
        shares_delta=6.0,
        prices={1: _PRICE, 2: _PRICE},
        cash_after=50.0 - 6.0 * _PRICE,
        max_leverage=1.0,
    )
    assert not verdict.ok
    assert verdict.equity == 100.0
    assert verdict.gross_exposure == 110.0


def test_leverage_factor_raises_the_ceiling() -> None:
    # Same 120 buy that fails at 1.0 passes at 2.0 (limit 200).
    verdict = evaluate_margin(
        positions_before={},
        traded_player_id=1,
        shares_delta=15.0,
        prices={1: _PRICE},
        cash_after=100.0 - 15.0 * _PRICE,
        max_leverage=2.0,
    )
    assert verdict.ok
    assert verdict.limit == 200.0
