"""Event-derived discipline counts — Application Service (CQRS query side).

DDD role: Read-model query service. The single Python gateway to the
``core.player_fixture_discipline`` / ``core.player_season_discipline`` views
(Alembic 0044, convention fixed in 0045), which own the ONE definition of
card semantics — the Google convention: a second yellow is BOTH cards.
yellow = ``yellow_card`` + ``yellow_red_card`` events;
red    = ``red_card``    + ``yellow_red_card`` events.
A sent-off-for-two-yellows player therefore shows 2 yellows + 1 red.

Why event-derived: ``core.match_event`` is reconciled live against the
provider feed on every poll, so counts read here move DURING a match and are
equal to the displayed timeline by construction. The card columns projected
from Sportmonks aggregate statistics (``player_tournament_stat`` /
``player_match_stat``) are end-of-match/daily snapshots — they stay stored as
raw projections but must never be displayed.

A player with events but no card simply has no row: read absence as 0 when
you know the player featured, NULL/unknown otherwise (callers decide).
"""

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True, slots=True)
class Discipline:
    """Value Object — a player's card counts in some scope (fixture or season)."""

    yellow_cards: int
    red_cards: int


DISCIPLINE_ZERO = Discipline(yellow_cards=0, red_cards=0)


async def season_discipline(session: AsyncSession, *, player_ids: list[int], season_id: int) -> dict[int, Discipline]:
    """Card counts per player over a season. Players without any card are
    absent from the result — use ``.get(pid, DISCIPLINE_ZERO)`` for featured
    players."""
    if not player_ids:
        return {}
    rows = await session.execute(
        text(
            """
            SELECT player_id, yellow_cards, red_cards
            FROM core.player_season_discipline
            WHERE season_id = :season_id AND player_id = ANY(:player_ids)
            """
        ),
        {"season_id": season_id, "player_ids": player_ids},
    )
    return {r.player_id: Discipline(yellow_cards=r.yellow_cards, red_cards=r.red_cards) for r in rows}


async def fixture_discipline(session: AsyncSession, *, fixture_id: int) -> dict[int, Discipline]:
    """Card counts per player within one fixture."""
    rows = await session.execute(
        text(
            """
            SELECT player_id, yellow_cards, red_cards
            FROM core.player_fixture_discipline
            WHERE fixture_id = :fixture_id
            """
        ),
        {"fixture_id": fixture_id},
    )
    return {r.player_id: Discipline(yellow_cards=r.yellow_cards, red_cards=r.red_cards) for r in rows}
