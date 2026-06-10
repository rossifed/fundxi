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
) -> TradeOutcome:
    """Resolve → price at server → execute. Raises the domain errors above
    (and ``TradeError`` from execution); the caller maps them to transport."""
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
