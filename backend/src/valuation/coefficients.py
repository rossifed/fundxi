"""Pricing model coefficients (v0).

DDD role: Configuration. ``PricingCoefficients`` is an immutable Value
Object; ``DEFAULT_COEFFICIENTS`` is loaded once at import from
``config/pricing.toml`` so the model can be re-tuned by editing a file
and restarting the worker — no code change, no redeploy. The dataclass
field defaults remain the fallback when the file (or a key) is absent.

Two unit conventions live here, by section:
- ``*_pct`` (Layer 2) are PERCENT per-poll stat deltas (``0.20`` == +0.20%),
  divided by 100 where consumed.
- ``*_frac`` (Model A live + tournament events) are FRACTIONS (``-0.40`` ==
  -40%), used directly.
"""

import tomllib
from dataclasses import dataclass, fields
from pathlib import Path

import structlog

log = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class PricingCoefficients:
    # --- Layer 2: continuous performance (per-poll stat diff) -----------
    # Applied to the diff of core.player_match_stat running totals between
    # two polls. Small per poll; density comes from frequency, not size.
    w_xg_per_0_1_pct: float = 0.45  # per +0.10 xG accrued since last poll
    w_xa_per_0_1_pct: float = 0.30  # per +0.10 xA accrued since last poll
    w_shot_on_target_pct: float = 0.20  # per shot on target
    w_shot_off_target_pct: float = 0.06  # per off-target shot
    w_key_pass_pct: float = 0.12  # per key pass
    # Per-poll clamp — one 10-15s window can't move more than this.
    max_delta_pct_per_poll: float = 2.0
    min_delta_pct_per_poll: float = -2.0

    # --- Model A: rating-driven live multiplier ------------------------
    # LiveDelta = clamp(
    #     clamp(rating_level + stat_bonus, live_floor, live_ceil)
    #         * volatility(max(base, vol_base_floor)) * pressure_mod,
    #     -live_abs_cap, +live_abs_cap)
    # rating_level(r) = (r - rating_baseline) * k_rating  — a LEVEL, not a
    # delta: recomputed from the CURRENT rating every poll, so the price
    # FALLS when the rating falls (reversible by construction). Frozen v1
    # calibration items; tuned on the first real recorded match
    # (context/FUNDXI-VALUATION-MODEL.md).
    rating_baseline: float = 6.5  # Sportmonks XI starting value; see config/pricing.toml for the rationale
    k_rating: float = 0.04  # +4% of price per rating point above the baseline
    live_floor_frac: float = -0.30  # one match can't pull a player below -30%
    live_ceil_frac: float = 0.40  # ...nor above +40%
    multiplier_floor: float = 0.05  # price stays strictly positive
    # Volatility is `(50 / max(base, vol_base_floor)) ^ 0.4`. The floor caps how
    # hard a small cap can move: without it a deep-squad player at 0.25-0.8 M€
    # gets a 5-8x multiplier (calibrated for a ~10 M€ floor, the spec §4.2
    # reference table's smallest entry), so a mediocre rating outmoves a star and
    # a single bad game swings -44%. Flooring the base keeps the small-cap-moves-
    # harder spirit within the calibrated range without the micro-cap explosion.
    vol_base_floor: float = 10.0
    # Hard, symmetric bound on the FINAL live move (after volatility + pressure):
    # one match's rating-driven swing can't exceed +/-30% regardless of base.
    # The live_floor/ceil above clamp the pre-volatility core; this clamps the
    # post-volatility result — the belt-and-suspenders that keeps any base value
    # realistic.
    live_abs_cap_frac: float = 0.30

    # --- Tournament result events (persistent, settled at full-time) ----
    # Applied ONCE per fixture, MULTIPLICATIVELY on the player's current price
    # (a -40% elimination is -40% of what he is worth NOW, not of his base) and
    # NOT volatility-scaled: a result is a COLLECTIVE fate — the whole squad
    # moves by the same fraction regardless of base value. Individual live
    # performance keeps its volatility scaling; this layer is on top of it.
    # See context/FUNDXI-VALUATION-MODEL.md §3.4 / §4.1.
    w_group_win_frac: float = 0.02  # group-stage win
    # INTERIM flat calibration (2026-06-30): symmetric +/-20% (EV-neutral coin-flip,
    # +EV for a skilled pick, loss bounded at -20%). Kept in sync with
    # config/pricing.toml. TO BE SUPERSEDED by odds-based settlement (reward scaled
    # by the Sportmonks win probability).
    w_knockout_win_frac: float = 0.20  # knockout win (team advances)
    w_knockout_elimination_frac: float = -0.20  # knockout loss (capped from -0.40)
    w_qualification_frac: float = 0.05  # group qualification (standings-driven, Step 2)
    w_suspension_frac: float = -0.10  # banned for the next match (red / 2-yellow accumulation)
    w_out_of_xi_frac: float = -0.02  # dropped from the XI (started last match, benched this one)
    # Did-not-play: applied per match a squad player gets 0 minutes, scaled by his
    # tournament tally of zero-minute matches: -1% x N (a benchwarmer rots faster
    # the longer he sits). Participation-based, NOT calendar decay: a player who
    # plays is never touched.
    w_did_not_play_frac: float = -0.01

    # --- Layer 3: Pressure Index modulator -----------------------------
    # delta *= clamp(pressure_factor, mod_min, mod_max). 1.0 = no-op.
    pressure_mod_min: float = 0.7
    pressure_mod_max: float = 1.3


# config/pricing.toml — this file is backend/src/valuation/coefficients.py,
# so ``parents[2]`` is the backend/ root.
_PRICING_TOML_PATH = Path(__file__).resolve().parents[2] / "config" / "pricing.toml"


def load_coefficients(path: Path = _PRICING_TOML_PATH) -> PricingCoefficients:
    """Build ``PricingCoefficients`` from a flat TOML file.

    - Missing file  -> the dataclass defaults (the model still runs).
    - Missing key   -> that field keeps its default.
    - Unknown key   -> ``ValueError`` (a typo in the config must fail
      loudly, never be a silently-ignored "tweak").
    - Non-numeric value -> ``ValueError``.
    """
    if not path.is_file():
        return PricingCoefficients()
    with path.open("rb") as handle:
        raw: dict[str, object] = tomllib.load(handle)

    known = {f.name for f in fields(PricingCoefficients)}
    unknown = sorted(set(raw) - known)
    if unknown:
        raise ValueError(f"{path}: unknown pricing coefficient(s): {unknown}")
    for key, value in raw.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{path}: coefficient {key!r} must be a number, got {value!r}")

    return PricingCoefficients(**{k: float(v) for k, v in raw.items()})  # type: ignore[arg-type]


DEFAULT_COEFFICIENTS = load_coefficients()

# Hot-reload cache: (mtime, coefficients) of the last successful TOML parse.
_hot_cache: tuple[float, PricingCoefficients] = (-1.0, DEFAULT_COEFFICIENTS)


def current_coefficients(path: Path = _PRICING_TOML_PATH) -> PricingCoefficients:
    """The live coefficients, re-read from the TOML whenever the file's mtime
    changes — so the worker picks up a calibration edit on the NEXT poll, no
    restart. Cheap: a single ``stat()`` per call, re-parsing only on a real edit.

    Safe under live editing, unlike the startup ``DEFAULT_COEFFICIENTS`` (which
    fails loudly on a bad file): a mid-tournament typo or a transient read error
    is logged and the LAST GOOD values are kept, never crashing the price feed."""
    global _hot_cache
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return _hot_cache[1]  # file briefly unavailable → keep last good
    if mtime == _hot_cache[0]:
        return _hot_cache[1]
    try:
        coefficients = load_coefficients(path)
    except ValueError as exc:
        # Typo / bad value saved during live calibration: ignore, keep last good.
        log.warning("pricing.coefficients.reload_rejected", error=str(exc))
        _hot_cache = (mtime, _hot_cache[1])  # don't re-warn until the file changes again
        return _hot_cache[1]
    if coefficients != _hot_cache[1]:
        log.info("pricing.coefficients.reloaded", path=str(path))
    _hot_cache = (mtime, coefficients)
    return coefficients
