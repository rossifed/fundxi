"""Player-value position cap — Domain Service (pure, no I/O).

A position may never exceed the player's whole value, long OR short:
``|ownership_fraction| <= 1.0``. The ``shares`` quantity IS that ownership
fraction (1.0 = the whole player = its total market value); a player is divided
into N shares only as a display denomination on the client, which carries no
weight here. Mirrors ``MAX_OWNERSHIP_FRACTION`` in the frontend
``trade_calc.ts`` so both ends enforce the same rule.
"""

from src.domain.portfolio.portfolio import TradeKind

# The whole player. A buy may take a position up to +1.0, a sell-to-open down to
# -1.0 (a 100%-of-value short). Symmetric by product decision.
MAX_OWNERSHIP_FRACTION = 1.0


def position_after(prev_shares: float, kind: TradeKind, qty: float) -> float:
    """Ownership fraction held once this trade is applied."""
    return prev_shares + qty if kind is TradeKind.BUY else prev_shares - qty


def would_exceed_player_cap(*, prev_shares: float, kind: TradeKind, qty: float, tol: float = 1e-6) -> bool:
    """True when the resulting position would breach +/-100% of the player.

    ``tol`` absorbs float drift so a position landing exactly on the cap (e.g. a
    buy sized precisely to the remaining headroom) is allowed, not rejected."""
    return abs(position_after(prev_shares, kind, qty)) > MAX_OWNERSHIP_FRACTION + tol


def would_open_short(*, prev_shares: float, kind: TradeKind, qty: float, tol: float = 1e-6) -> bool:
    """True when the trade would leave a net SHORT position (negative ownership).

    Long-only product rule: a SELL may reduce a long down to zero but never cross
    into a short, and a BUY can never produce one. ``tol`` absorbs float drift so a
    sell sized exactly to the held long (landing on zero) is allowed."""
    return position_after(prev_shares, kind, qty) < -tol
