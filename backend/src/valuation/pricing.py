"""Canonical pricing kernel — Model A. Pure functions; THE single source
of price truth (see ``context/FUNDXI-VALUATION-MODEL.md`` §3).

    Price       = BaseValue * Multiplier
    Multiplier  = 1 + TournamentDelta + LiveDelta

- ``TournamentDelta`` — persistent. Accumulates (match settlement +
  tournament events: qualif/elim/news/suspension). Never decays.
- ``LiveDelta`` — transient. Recomputed from the player's CURRENT live
  rating every poll, so the price falls when the rating falls
  (reversible by construction). Bounded, volatility- and
  pressure-scaled. Zero when the player's match is not live.

No double-count: during a match a goal/card moves the price ONLY
through the live rating Sportmonks raises/lowers — never a separate
per-event %. An event's durable value enters ``TournamentDelta`` once,
at settlement.

Units: everything is a FRACTION (``0.04`` == +4%); the % the UI shows
is ``fraction * 100``. One kernel, used identically by the live poller
and the replay — they cannot diverge.

DDD role: Domain Service (pure). No I/O, no clock, no randomness.
"""

from dataclasses import dataclass, field

from src.valuation.coefficients import DEFAULT_COEFFICIENTS, PricingCoefficients
from src.valuation.strategies.layered_v1 import StatSnapshot, continuous_stat_delta


@dataclass(frozen=True, slots=True)
class PriceSnapshot:
    """One poll's live inputs for ONE player. Every field degrades
    safely: no rating → neutral (a rating at the baseline ⇒ 0 contribution);
    no pressure → no-op modulator; not live → ``LiveDelta`` is 0."""

    rating: float | None = None
    prev_stats: StatSnapshot = field(default_factory=StatSnapshot)
    curr_stats: StatSnapshot = field(default_factory=StatSnapshot)
    pressure_factor: float | None = None
    is_live: bool = True


@dataclass(frozen=True, slots=True)
class PriceResult:
    price: float
    multiplier: float
    tournament_delta: float
    live_delta: float


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def volatility(base_value: float, coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS) -> float:
    """Small caps move harder than blue chips (spec §4.2):
    ``(50 / max(BaseValue, vol_base_floor)) ** 0.4``. The floor caps the
    multiplier for micro-caps (deep-squad players at 0.25-0.8 M€): without it
    they get a 5-8x multiplier (the formula was calibrated for a ~10 M€ smallest
    base), so a mediocre rating outmoves a star and one bad game swings -44%.
    Guards a non-positive base."""
    if base_value <= 0.0:
        return 1.0
    return (50.0 / max(base_value, coefficients.vol_base_floor)) ** 0.4


def rating_level(rating: float | None, coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS) -> float:
    """LEVEL (not a delta): ``(rating - baseline) * k``. Recomputed from the
    CURRENT rating each poll → reversible. ``None`` ⇒ 0 (neutral)."""
    if rating is None:
        return 0.0
    return (rating - coefficients.rating_baseline) * coefficients.k_rating


def stat_bonus(
    prev: StatSnapshot, curr: StatSnapshot, coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS
) -> float:
    """Small bounded refinement from stat increments since the last
    poll. Reuses the tested L2 function (percent) → fraction. Kept small
    on purpose: the rating already reflects most of performance."""
    return continuous_stat_delta(prev=prev, curr=curr, coefficients=coefficients) / 100.0


def pressure_mod(pressure_factor: float | None, coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS) -> float:
    """Team Pressure Index modulator, clamped. ``None`` ⇒ 1.0 (no-op)."""
    if pressure_factor is None:
        return 1.0
    return _clamp(pressure_factor, coefficients.pressure_mod_min, coefficients.pressure_mod_max)


def live_delta(
    snapshot: PriceSnapshot, base_value: float, coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS
) -> float:
    """Transient in-match component. 0 when the match is not live."""
    if not snapshot.is_live:
        return 0.0
    core = rating_level(snapshot.rating, coefficients) + stat_bonus(
        snapshot.prev_stats, snapshot.curr_stats, coefficients
    )
    bounded = _clamp(core, coefficients.live_floor_frac, coefficients.live_ceil_frac)
    scaled = bounded * volatility(base_value, coefficients) * pressure_mod(snapshot.pressure_factor, coefficients)
    # Hard, symmetric bound on the FINAL move: even a high-volatility small cap
    # can't swing more than +/-live_abs_cap_frac in one match.
    return _clamp(scaled, -coefficients.live_abs_cap_frac, coefficients.live_abs_cap_frac)


def multiplier(
    tournament_delta: float, live: float, coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS
) -> float:
    """``1 + TournamentDelta + LiveDelta``, floored strictly positive."""
    return max(coefficients.multiplier_floor, 1.0 + tournament_delta + live)


def price(
    base_value: float,
    tournament_delta: float,
    snapshot: PriceSnapshot,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> PriceResult:
    """THE price function. Everything (current price, total%, last-match%,
    PnL) derives from this one result — no parallel formula anywhere."""
    ld = live_delta(snapshot, base_value, coefficients)
    m = multiplier(tournament_delta, ld, coefficients)
    return PriceResult(
        price=round(base_value * m, 2),
        multiplier=m,
        tournament_delta=tournament_delta,
        live_delta=ld,
    )


def tournament_delta_from(last_settled_price: float | None, base_value: float) -> float:
    """The persistent "account balance" carried into the current match,
    derived from the existing price series (no separate store):
    ``last_settled_price / base - 1``. None / non-positive base ⇒ 0.0
    (tournament start: nothing banked yet)."""
    if last_settled_price is None or base_value <= 0.0:
        return 0.0
    return last_settled_price / base_value - 1.0


def price_from_carried(
    base_value: float,
    carried_price: float | None,
    snapshot: PriceSnapshot,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> PriceResult:
    """Price a player from his carried-in price + this poll's live
    snapshot. THE entry point both the live poller and the simulation
    use: the persistent (tournament) / transient (live) split is computed
    here once, so the two ingestion paths cannot diverge on the formula —
    they differ only in their inputs (the carried price and the rating)."""
    tournament_delta = tournament_delta_from(carried_price, base_value)
    return price(base_value, tournament_delta, snapshot, coefficients)


def settle(tournament_delta: float, live_delta_at_ft: float) -> float:
    """Full-time: cash the realised in-match performance into the
    persistent component ONCE. ``LiveDelta`` then resets to 0 for the
    next match. This settled increment IS the player's "last match %"."""
    return tournament_delta + live_delta_at_ft


def apply_result_event(
    current_price: float,
    impact_frac: float,
    *,
    base_value: float,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> float:
    """A discrete, persistent tournament RESULT applied MULTIPLICATIVELY on the
    player's CURRENT price: a -40% elimination is -40% of what he is worth NOW,
    not of his base. This is what makes an eliminated team's price crash
    brutally and consistently (-40% regardless of how high the run had taken
    him). Floored at ``multiplier_floor`` of the base so the price stays
    strictly positive (spec Q3). Not volatility-scaled — a result is a
    collective fate, applied equally to the whole squad by the caller."""
    floor = base_value * coefficients.multiplier_floor
    return round(max(floor, current_price * (1.0 + impact_frac)), 2)
