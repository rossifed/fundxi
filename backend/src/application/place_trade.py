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
from src.domain.portfolio.position_cap import MAX_OWNERSHIP_FRACTION, would_exceed_player_cap, would_open_short
from src.domain.portfolio.user import UserRepository
from src.domain.valuation.starting_price_provider import StartingPriceProvider


class UserNotFoundError(Exception):
    """The authenticated user id no longer resolves to a user."""


class PlayerOwnershipCapError(Exception):
    """The trade would push the position past +/-100% of the player's value.

    A position may never exceed the player's whole value in either direction
    (see domain/portfolio/position_cap.py). Carries the held + requested
    fractions so the transport layer can explain the rejection."""

    def __init__(self, *, player_id: int, held: float, requested: float, kind: TradeKind) -> None:
        self.player_id = player_id
        self.held = held
        self.requested = requested
        super().__init__(
            f"position cap: a {kind.value} of {requested:.4f} on top of {held:.4f} would exceed "
            f"+/-{MAX_OWNERSHIP_FRACTION:.0f}x the player's value"
        )


class ShortingDisabledError(Exception):
    """The trade would open or extend a short — disabled by the long-only rule.

    The product is long-only (see domain/portfolio/position_cap.py): a sell may
    reduce a holding to zero but never go below. Carries the held + requested
    quantities so the transport layer can explain the rejection."""

    def __init__(self, *, player_id: int, held: float, requested: float) -> None:
        self.player_id = player_id
        self.held = held
        self.requested = requested
        super().__init__(
            f"shorting is disabled: cannot sell {requested:.4f} while holding only {held:.4f}"
        )


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
    # Optional client idempotency token (``Idempotency-Key`` header). When set,
    # a duplicate submission carrying the same key replays the recorded trade
    # instead of executing a second one. ``None`` keeps the legacy behaviour.
    idempotency_key: str | None = None


async def place_trade(
    *,
    command: PlaceTradeCommand,
    user_repo: UserRepository,
    portfolio_repo: PortfolioRepository,
    trade_repo: TradeRepository,
    price_provider: LatestPriceProvider,
    starting_price_provider: StartingPriceProvider,
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

    # Idempotency replay. Checked AFTER taking the portfolio lock so two
    # identical submissions racing in parallel serialize: the second blocks on
    # the lock, then finds the trade the first committed and replays it instead
    # of executing again. The DB unique (portfolio_id, idempotency_key) is the
    # backstop. The replay returns the stored trade with the portfolio's CURRENT
    # state (intervening trades are honestly reflected); the guarantee is that
    # the side effect happened exactly once.
    if command.idempotency_key is not None:
        existing = await trade_repo.get_by_idempotency_key(
            portfolio_id=portfolio.id, idempotency_key=command.idempotency_key
        )
        if existing is not None:
            holding = await portfolio_repo.get_holding(
                portfolio_id=portfolio.id, player_id=existing.player_id
            )
            return TradeOutcome(trade=existing, portfolio=portfolio, holding=holding)

    try:
        kind = TradeKind(command.kind)
    except ValueError as exc:
        raise InvalidTradeKindError(command.kind) from exc

    # Player-value cap (authoritative — the client caps its preview too, but it
    # is never trusted). A position may never exceed +/-100% of the player.
    held = await portfolio_repo.get_holding(portfolio_id=portfolio.id, player_id=command.player_id)
    prev_shares = held.shares if held else 0.0
    if would_exceed_player_cap(prev_shares=prev_shares, kind=kind, qty=command.shares):
        raise PlayerOwnershipCapError(
            player_id=command.player_id, held=prev_shares, requested=command.shares, kind=kind
        )
    # Long-only: a sell can reduce a holding to zero but never open a short.
    # Authoritative — the client caps its slider too, but it is never trusted.
    if would_open_short(prev_shares=prev_shares, kind=kind, qty=command.shares):
        raise ShortingDisabledError(
            player_id=command.player_id, held=prev_shares, requested=command.shares
        )

    # Authoritative execution price = latest server-side valuation tick. The
    # client price is display-only and never trusted, or a client could buy
    # low / sell high at will.
    prices = await price_provider.get_many([command.player_id])
    server_price = prices.get(command.player_id)
    if server_price is None or server_price <= 0:
        # No tick yet (never priced / pre-seed): a player's starting price IS its
        # base value — the SAME price the Screener shows — so a seeded player stays
        # tradeable. An un-priceable player (no base value) → None → reject (409),
        # never an invented price.
        starting = await starting_price_provider.get_many([command.player_id])
        server_price = starting.get(command.player_id)
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
            idempotency_key=command.idempotency_key,
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
