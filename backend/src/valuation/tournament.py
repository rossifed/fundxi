"""Tournament settlement — a finished fixture's RESULT → persistent price impact.

DDD role: Domain Service (pure). No I/O, no clock, no randomness. Turns a
finished fixture into the discrete, persistent impact each team's players carry
out of the match, then plans the settlement ticks. The volatile in-match
performance is already banked in each player's last live tick; this layer adds
ONLY the collective consequence of the RESULT:

- group-stage win  → ``w_group_win_frac``      (+2%)
- knockout win     → ``w_knockout_win_frac``   (+5%, team advances)
- knockout loss    → ``w_knockout_elimination_frac`` (-40%, ELIMINATED — the
  brutal drop the product hinges on)

Arbitrage (validated with the user): result impacts are MULTIPLICATIVE on the
player's current price and are NOT volatility-scaled — elimination is a
collective fate, the whole squad drops by the same fraction regardless of base
value. Volatility scaling stays reserved for individual live performance.

Group QUALIFICATION (+5%) is a separate, standings-driven event handled
elsewhere (it is decided when a group completes, not at a single fixture's FT).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum

from src.domain.match.match_event import MatchEventType
from src.valuation.coefficients import DEFAULT_COEFFICIENTS, PricingCoefficients
from src.valuation.pricing import apply_result_event


class Side(StrEnum):
    HOME = "home"
    AWAY = "away"


def is_group_stage(stage_name: str | None) -> bool:
    """A fixture is group stage iff its Sportmonks stage label says "group"
    (e.g. "Group Stage"). Anything else (Round of 16, Quarter-final … Final) is
    knockout. Unknown / ``None`` → treated as group stage on purpose: we never
    fabricate an elimination crash when the phase is unknown."""
    if stage_name is None:
        return True
    return "group" in stage_name.lower()


def decisive_winner(home_score: int | None, away_score: int | None) -> Side | None:
    """The winning side from the regulation/extra-time scores, or ``None`` when
    the scores are level or unknown.

    A level KNOCKOUT (decided on penalties) returns ``None`` here: the shootout
    winner is NOT in these scores. The caller must then either supply the winner
    explicitly or safely skip the elimination — never crash the wrong team."""
    if home_score is None or away_score is None:
        return None
    if home_score > away_score:
        return Side.HOME
    if away_score > home_score:
        return Side.AWAY
    return None


def result_impact_frac(
    *,
    is_group: bool,
    is_winner: bool,
    is_loser: bool,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> float:
    """The persistent fraction one team's players carry out of a finished match.

    Group stage: a win pays ``w_group_win_frac``; draw/loss = 0 (qualification
    is handled separately). Knockout: a win pays ``w_knockout_win_frac``; a loss
    is ELIMINATION (``w_knockout_elimination_frac``)."""
    if is_group:
        return coefficients.w_group_win_frac if is_winner else 0.0
    if is_winner:
        return coefficients.w_knockout_win_frac
    if is_loser:
        return coefficients.w_knockout_elimination_frac
    return 0.0


def per_side_impacts(
    *,
    is_group: bool,
    winner: Side | None,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> tuple[float, float]:
    """``(home_impact, away_impact)`` for a finished fixture. ``winner=None``
    means a draw (group) or an undetermined knockout — both yield ``(0, 0)``;
    for knockouts the caller is expected to skip on ``None`` rather than settle
    a no-op."""
    home_winner = winner is Side.HOME
    away_winner = winner is Side.AWAY
    # In a knockout the non-winning side is eliminated; in a group nobody is a
    # "loser" for pricing (only a win pays).
    home_loser = (not is_group) and away_winner
    away_loser = (not is_group) and home_winner
    home = result_impact_frac(
        is_group=is_group, is_winner=home_winner, is_loser=home_loser, coefficients=coefficients
    )
    away = result_impact_frac(
        is_group=is_group, is_winner=away_winner, is_loser=away_loser, coefficients=coefficients
    )
    return home, away


@dataclass(frozen=True, slots=True)
class SettlementTick:
    """One player's settled price after a persistent event is applied on top of
    his last price. ``rating`` is carried from his last tick so the event tick
    doesn't reset the displayed performance rating."""

    player_id: int
    price: float
    rating: float


def _settle_player(
    *,
    player_id: int,
    impact_frac: float,
    base_by_player: Mapping[int, float | None],
    last_price_by_player: Mapping[int, float],
    rating_by_player: Mapping[int, float],
    coefficients: PricingCoefficients,
) -> SettlementTick | None:
    """One player's persistent-event tick, or ``None`` when there is nothing to
    write: un-seeded (no base → never synthesised) or no visible price move.
    ``last_price`` falls back to the base value (his current worth IS his base
    when he has no prior tick); ``rating`` to the neutral baseline rating."""
    base = base_by_player.get(player_id)
    if base is None:
        return None
    last_price = last_price_by_player.get(player_id, base)
    settled = apply_result_event(last_price, impact_frac, base_value=base, coefficients=coefficients)
    if round(last_price, 2) == settled:
        return None
    return SettlementTick(
        player_id=player_id, price=settled, rating=rating_by_player.get(player_id, coefficients.rating_baseline)
    )


def plan_impacts(
    *,
    impacts_by_player: Mapping[int, float],
    base_by_player: Mapping[int, float | None],
    last_price_by_player: Mapping[int, float],
    rating_by_player: Mapping[int, float],
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> list[SettlementTick]:
    """Apply a PER-PLAYER ``impact_frac`` (multiplicative on current price). The
    general shape: suspension/qualification pass a uniform impact, did-not-play
    passes ``-1% x zero-minute-tally`` per player. One tick per priceable player
    whose price actually moves."""
    ticks: list[SettlementTick] = []
    for player_id, impact_frac in impacts_by_player.items():
        if impact_frac == 0.0:
            continue
        tick = _settle_player(
            player_id=player_id,
            impact_frac=impact_frac,
            base_by_player=base_by_player,
            last_price_by_player=last_price_by_player,
            rating_by_player=rating_by_player,
            coefficients=coefficients,
        )
        if tick is not None:
            ticks.append(tick)
    return ticks


def plan_flat_impact(
    *,
    player_ids: Sequence[int],
    base_by_player: Mapping[int, float | None],
    last_price_by_player: Mapping[int, float],
    rating_by_player: Mapping[int, float],
    impact_frac: float,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> list[SettlementTick]:
    """Apply the SAME ``impact_frac`` to a set of players — the shared shape
    behind qualification (+5% to a qualified squad) and suspension (-15% to
    banned players). Thin wrapper over ``plan_impacts``."""
    return plan_impacts(
        impacts_by_player={player_id: impact_frac for player_id in player_ids},
        base_by_player=base_by_player,
        last_price_by_player=last_price_by_player,
        rating_by_player=rating_by_player,
        coefficients=coefficients,
    )


def newly_suspended_players(
    *,
    cards_in_fixture: Sequence[tuple[int, str]],
    cumulative_yellows: Mapping[int, int],
) -> set[int]:
    """Players who become suspended for their NEXT match as of this finished
    fixture (each earns a one-off -15%).

    - A ``red_card`` or ``yellow_red_card`` in this fixture → straight ban.
    - A ``yellow_card`` in this fixture that brings the player's cumulative
      tournament yellow count to an even number (2, 4, …) → accumulation ban
      (FIFA's two-yellows rule; the count resets after each ban is served, so a
      ban recurs at every even total).

    ``cards_in_fixture`` are ``(player_id, event_type)`` for THIS fixture's
    cards; ``cumulative_yellows`` is each player's total ``yellow_card`` count
    including this fixture."""
    suspended: set[int] = set()
    yellow_in_fixture: set[int] = set()
    for player_id, event_type in cards_in_fixture:
        if event_type in (MatchEventType.RED_CARD.value, MatchEventType.YELLOW_RED_CARD.value):
            suspended.add(player_id)
        elif event_type == MatchEventType.YELLOW_CARD.value:
            yellow_in_fixture.add(player_id)
    for player_id in yellow_in_fixture:
        total = cumulative_yellows.get(player_id, 0)
        if total >= 2 and total % 2 == 0:
            suspended.add(player_id)
    return suspended


def dropped_starters(*, previous_starters: set[int], current_starters: set[int]) -> set[int]:
    """Players who started their team's PREVIOUS match but are no longer in the
    starting XI (benched or out of squad) — the "expected starter who got
    dropped" signal worth a one-off -2%. Defining "expected" as "started last
    match" avoids penalising every habitual substitute. Empty when there is no
    previous match (tournament opener) — no expectation has formed yet."""
    return previous_starters - current_starters


def qualified_team_ids(knockout_fixtures: Sequence[tuple[str, str]]) -> set[str]:
    """The set of teams that have reached the knockout bracket — i.e. every team
    that appears (home or away) in a knockout fixture. This is provider truth:
    Sportmonks fills the knockout participants once the groups resolve, so we
    never re-implement FIFA's tie-break / best-third rules (format-agnostic:
    works for WC2022 top-2 and WC2026 top-2 + best-thirds alike)."""
    teams: set[str] = set()
    for home, away in knockout_fixtures:
        teams.add(home)
        teams.add(away)
    return teams


def plan_qualification(
    *,
    qualified: set[str],
    roster: Sequence[tuple[int, str]],
    base_by_player: Mapping[int, float | None],
    last_price_by_player: Mapping[int, float],
    rating_by_player: Mapping[int, float],
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> list[SettlementTick]:
    """A flat ``w_qualification_frac`` (+5%) on every player of a qualified team
    (whole squad shares the reward), multiplicative on his current price. One
    ``SettlementTick`` per priceable player whose price actually moves."""
    qualified_player_ids = [player_id for player_id, team_id in roster if team_id in qualified]
    return plan_flat_impact(
        player_ids=qualified_player_ids,
        base_by_player=base_by_player,
        last_price_by_player=last_price_by_player,
        rating_by_player=rating_by_player,
        impact_frac=coefficients.w_qualification_frac,
        coefficients=coefficients,
    )


def plan_settlement(
    *,
    home_team_id: str,
    away_team_id: str,
    is_group: bool,
    winner: Side | None,
    roster: Sequence[tuple[int, str]],
    base_by_player: Mapping[int, float | None],
    last_price_by_player: Mapping[int, float],
    rating_by_player: Mapping[int, float],
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> list[SettlementTick]:
    """Pure settlement plan for BOTH teams' rosters (starters + bench: the whole
    squad shares the result). One ``SettlementTick`` per player whose team has a
    non-zero result impact, who has a real base value (un-seeded → skipped,
    never synthesised), and whose price actually moves.

    ``last_price_by_player`` falls back to the base value when a player has no
    prior tick (his current worth IS his base); ``rating_by_player`` falls back
    to the neutral baseline rating."""
    home_impact, away_impact = per_side_impacts(is_group=is_group, winner=winner, coefficients=coefficients)
    impact_by_team = {home_team_id: home_impact, away_team_id: away_impact}

    ticks: list[SettlementTick] = []
    for player_id, team_id in roster:
        impact = impact_by_team.get(team_id, 0.0)
        if impact == 0.0:
            continue  # this team's result pays nothing (group draw/loss)
        tick = _settle_player(
            player_id=player_id,
            impact_frac=impact,
            base_by_player=base_by_player,
            last_price_by_player=last_price_by_player,
            rating_by_player=rating_by_player,
            coefficients=coefficients,
        )
        if tick is not None:
            ticks.append(tick)
    return ticks
