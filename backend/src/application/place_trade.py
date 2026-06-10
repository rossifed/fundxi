"""Place-trade — Application Service (Use Case).

DDD role: Application Service / Use Case. Owns the *policy* around a trade that
used to sit in the HTTP router: resolve the caller's portfolio under a row lock,
parse the trade kind, and price the trade at the authoritative server-side
valuation (the client-supplied price is advisory and never trusted). It then
delegates the atomic mutation to ``execute_trade``.

Depends only on ports (UserRepository, PortfolioRepository, TradeRepository,
LatestPriceProvider); concrete adapters are wired at the composition root. No
HTTP, no commit — the caller owns the transaction boundary.
"""

from dataclasses import dataclass

from src.application.portfolio_snapshot_service import LatestPriceProvider
from src.application.trade_execution import TradeOutcome, TradeRequest, execute_trade
from src.domain.portfolio.margin import MarginVerdict, evaluate_margin
from src.domain.portfolio.portfolio import PortfolioRepository, TradeKind, TradeRepository
from src.domain.portfolio.user import UserRepository


class UserNotFoundError(Exception):
    """The authenticated user id no longer resolves to a user."""


class PortfolioNotFoundError(Exception):
    """The user has no portfolio to trade against."""


class InvalidTradeKindError(Exception):
    """``kind`` was not a valid TradeKind."""


class NoServerPriceError(Exception):
    """No authoritative price is available for the player — cannot execute."""


class InsufficientMarginError(Exception):
    """The trade would push gross exposure past the leverage limit.

    Carries the verdict so the transport layer can explain the rejection
    (current equity vs the exposure the trade would create)."""

    def __init__(self, verdict: MarginVerdict) -> None:
        self.verdict = verdict
        super().__init__(
            f"insufficient buying power: trade would raise gross exposure to "
            f"€{verdict.gross_exposure:.2f}M, above the €{verdict.limit:.2f}M limit "
            f"(equity €{verdict.equity:.2f}M)"
        )


@dataclass(frozen=True, slots=True)
class PlaceTradeCommand:
    user_id: int
    player_id: int
    kind: str  # validated here against TradeKind
    shares: float


async def place_trade(
    *,
    command: PlaceTradeCommand,
    user_repo: UserRepository,
    portfolio_repo: PortfolioRepository,
    trade_repo: TradeRepository,
    price_provider: LatestPriceProvider,
    max_leverage: float,
) -> TradeOutcome:
    """Resolve → price at server → check buying power → execute. Raises the
    domain errors above (and ``TradeError`` from execution); the caller maps
    them to transport. ``max_leverage`` is the gross-exposure ceiling as a
    multiple of equity (wired from settings at the composition root)."""
    user = await user_repo.get_by_id(command.user_id)
    if user is None:
        raise UserNotFoundError(command.user_id)

    # Lock the portfolio row FOR UPDATE: concurrent trades on the same portfolio
    # serialize on this lock (held until the caller commits), so the
    # read-modify-write on cash/holdings can't lose an update.
    portfolio = await portfolio_repo.get_by_user_id_for_update(user.id)
    if portfolio is None:
        raise PortfolioNotFoundError(user.id)

    try:
        kind = TradeKind(command.kind)
    except ValueError as exc:
        raise InvalidTradeKindError(command.kind) from exc

    # Authoritative execution price = latest server-side valuation tick. The
    # client price is display-only and never trusted, or a client could buy
    # low / sell high at will.
    prices = await price_provider.get_many([command.player_id])
    server_price = prices.get(command.player_id)
    if server_price is None or server_price <= 0:
        raise NoServerPriceError(command.player_id)

    await _enforce_margin(
        portfolio_repo=portfolio_repo,
        price_provider=price_provider,
        portfolio_id=portfolio.id,
        cash=portfolio.cash,
        player_id=command.player_id,
        kind=kind,
        shares=command.shares,
        server_price=server_price,
        max_leverage=max_leverage,
    )

    return await execute_trade(
        request=TradeRequest(
            portfolio_id=portfolio.id,
            player_id=command.player_id,
            kind=kind,
            shares=command.shares,
            price=server_price,
        ),
        portfolio=portfolio,
        portfolio_repo=portfolio_repo,
        trade_repo=trade_repo,
    )


async def _enforce_margin(
    *,
    portfolio_repo: PortfolioRepository,
    price_provider: LatestPriceProvider,
    portfolio_id: int,
    cash: float,
    player_id: int,
    kind: TradeKind,
    shares: float,
    server_price: float,
    max_leverage: float,
) -> None:
    """Reject the trade if it would breach the leverage limit. Gathers the
    portfolio's current positions and a price for each (latest tick, falling
    back to cost basis for un-ticked holdings, same convention as the snapshot
    service), then defers the decision to the pure ``evaluate_margin``."""
    holdings = await portfolio_repo.list_holdings(portfolio_id)
    positions_before = {h.player_id: h.shares for h in holdings}

    other_ids = [h.player_id for h in holdings if h.player_id != player_id]
    other_prices = await price_provider.get_many(other_ids) if other_ids else {}
    prices: dict[int, float] = {h.player_id: other_prices.get(h.player_id, h.average_buy_price) for h in holdings}
    prices[player_id] = server_price  # the traded player is always priced at the server tick

    total = shares * server_price
    if kind is TradeKind.BUY:
        shares_delta, cash_after = shares, cash - total
    else:
        shares_delta, cash_after = -shares, cash + total

    verdict = evaluate_margin(
        positions_before=positions_before,
        traded_player_id=player_id,
        shares_delta=shares_delta,
        prices=prices,
        cash_after=cash_after,
        max_leverage=max_leverage,
    )
    if not verdict.ok:
        raise InsufficientMarginError(verdict)
